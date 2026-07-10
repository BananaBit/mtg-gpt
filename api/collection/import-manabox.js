import formidable from "formidable";
import { parse } from "csv-parse";
import fs from "node:fs";
import crypto from "node:crypto";
import { getSupabaseClient } from "../../lib/supabase.js";

// Disable default Vercel body parser to allow formidable to handle the raw stream
export const config = {
  api: {
    bodyParser: false,
  },
};

// Helper to resolve form fields parsed by formidable
function getFirstFieldValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

// Helper to look up CSV row values using a list of potential column name aliases (case-insensitively)
function getRowValue(csvRow, aliases) {
  // Try direct matches first
  for (const alias of aliases) {
    if (csvRow[alias] !== undefined && csvRow[alias] !== null) {
      return csvRow[alias];
    }
  }

  // Fallback to case-insensitive match
  const rowKeys = Object.keys(csvRow);
  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase();
    const foundKey = rowKeys.find((k) => k.toLowerCase() === lowerAlias);
    if (foundKey && csvRow[foundKey] !== undefined && csvRow[foundKey] !== null) {
      return csvRow[foundKey];
    }
  }

  return null;
}

export default async function handler(req, res) {
  // 1. Require POST method
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // 2. Validate X-API-Key
  const apiKey = req.headers["x-api-key"];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    console.error("API_KEY environment variable is not configured.");
    return res.status(500).json({ error: "Server authentication is not configured" });
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let tempFilepath = null;

  try {
    // Initialize Supabase early to fail fast if config is missing
    const supabase = getSupabaseClient();

    // 3. Parse Multipart Form data
    const form = formidable({});
    const [fields, files] = await form.parse(req);

    // Get the first uploaded file
    const uploadedFile = Object.values(files)[0];
    const file = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

    if (!file || !file.filepath) {
      return res.status(400).json({ error: "No file uploaded. Please upload a CSV file." });
    }

    tempFilepath = file.filepath;

    // 4. Parse CSV File
    const csvRows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempFilepath)
        .pipe(
          parse({
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true, // Auto-strip UTF-8 BOM if present
          })
        )
        .on("data", (row) => csvRows.push(row))
        .on("error", reject)
        .on("end", resolve);
    });

    if (csvRows.length === 0) {
      return res.status(400).json({ error: "Uploaded CSV file is empty." });
    }

    // 5. Generate or retrieve import session ID
    const import_id = getFirstFieldValue(fields.import_id) || crypto.randomUUID();

    // 6. Normalize and map rows
    const normalizedRows = csvRows.map((csvRow) => {
      // Set code normalization
      let setCode = getRowValue(csvRow, ["Set code", "Set", "set_code", "set"]);
      if (setCode) {
        setCode = String(setCode).trim().toLowerCase();
      }

      // Quantity parser
      const qtyVal = getRowValue(csvRow, ["Quantity", "quantity"]);
      let quantity = qtyVal !== null ? Number(qtyVal) : 1;
      if (Number.isNaN(quantity)) {
        quantity = 1;
      }

      // Foil boolean check
      const foilVal = String(getRowValue(csvRow, ["Foil", "foil"]) || "").trim().toLowerCase();
      const foil = foilVal === "true" || foilVal === "foil" || foilVal === "yes";

      return {
        scryfall_id: getRowValue(csvRow, ["Scryfall ID", "scryfall_id", "id"]) || null,
        name: getRowValue(csvRow, ["Name", "Card Name", "name", "card_name"]),
        set_code: setCode || null,
        collector_number: getRowValue(csvRow, ["Collector Number", "collector_number", "number"]) || null,
        quantity: quantity,
        foil: foil,
        condition: getRowValue(csvRow, ["Condition", "condition"]) || null,
        language: getRowValue(csvRow, ["Language", "language"]) || null,
        location: getRowValue(csvRow, ["Binder Name", "List Name", "binder_name", "list_name", "location"]) || null,
        import_id: import_id,
      };
    });

    // Validate that we have some valid card data
    const validRows = normalizedRows.filter((r) => r.name || r.scryfall_id);
    if (validRows.length === 0) {
      return res.status(400).json({ error: "Could not find any rows with valid card Name or Scryfall ID." });
    }

    // 7. Upsert rows into owned_cards in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from("owned_cards").upsert(batch);

      if (error) {
        console.error("Supabase upsert error:", error);
        return res.status(500).json({
          error: `Failed to insert card records at batch starting at row ${i + 1}: ${error.message}`,
        });
      }
    }

    // 8. Return success response
    return res.status(200).json({
      success: true,
      import_id,
      total_records: validRows.length,
    });
  } catch (error) {
    console.error("Import processing error:", error);
    return res.status(500).json({
      error: error.message || "Internal server error during CSV processing",
    });
  } finally {
    // 9. Clean up temporary uploaded file
    if (tempFilepath && fs.existsSync(tempFilepath)) {
      try {
        fs.unlinkSync(tempFilepath);
      } catch (err) {
        console.error("Failed to clean up temp file:", tempFilepath, err);
      }
    }
  }
}
