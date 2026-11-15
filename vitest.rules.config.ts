import { defineConfig } from "vitest/config";

// Firestore security-rules tests. They need the emulator, so run them with:
//   firebase emulators:exec --only firestore --project demo-javani "npm run test:rules"
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.emulator.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
