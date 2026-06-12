import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import handler from "./api/simulate-pack.js";

async function test(type) {
    console.log(`\n--- Testing ${type} ---`);
    const mockReq = { method: "GET", query: { set: "msh", type } };
    const mockRes = {
        setHeader: () => {},
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            console.log(`Status: ${this.statusCode}`);
            if (this.statusCode !== 200) {
                console.log(data);
                return;
            }
            console.log(`Total Count: ${data.count}`);
            const slots = {};
            for (const card of data.cards) {
                slots[card.slot] = (slots[card.slot] || 0) + 1;
                if (card.slot !== 'land' && card.is_basic_land) {
                    console.log(`ERROR: Basic land found in slot ${card.slot}: ${card.name}`);
                }
            }
            console.log("Slots:", slots);
        }
    };
    await handler(mockReq, mockRes);
}

await test("play_booster");
await test("prerelease_pool");
process.exit(0);
