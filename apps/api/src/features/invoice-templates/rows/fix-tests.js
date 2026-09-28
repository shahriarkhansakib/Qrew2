const fs = require("node:fs");
const path = require("node:path");

const controllersDir =
  "c:/__projects/Hybrid/starter/apps/api/src/features/invoice-templates/rows/controllers";
const files = fs.readdirSync(controllersDir).filter((f) => f.endsWith(".test.ts"));

for (const file of files) {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, "utf-8");

  content = content.replace(
    /import \{ TemplateRowsController \} from "\.\.\/template-rows\.controller";\n/g,
    "",
  );
  content = content.replace(
    /import \{ TemplateRowChargesController \} from "\.\.\/template-row-charges\.controller";\n/g,
    "",
  );

  const calls = [...content.matchAll(/TemplateRow(?:s|Charges)Controller\.([a-zA-Z0-9]+)\(/g)];
  const functionNames = [...new Set(calls.map((m) => m[1]))];

  for (const fnName of functionNames) {
    let controllerFileName;
    // We need to find the controller file for this function
    if (fnName.includes("Charge")) {
      const _kebab = fnName
        .replace("Charge", "-charge")
        .replace("Charges", "-charges")
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .toLowerCase();
      // Wait, is it manage-row-charge? list-row-charges?
      // Let's check files in controllersDir
      const possibleFiles = fs
        .readdirSync(controllersDir)
        .filter((f) => f.endsWith(".controller.ts"));
      // Find the file that exports fnName
      for (const pFile of possibleFiles) {
        const pContent = fs.readFileSync(path.join(controllersDir, pFile), "utf-8");
        if (pContent.includes(`export async function ${fnName}`)) {
          controllerFileName = pFile.replace(".ts", "");
          break;
        }
      }
    } else {
      const possibleFiles = fs
        .readdirSync(controllersDir)
        .filter((f) => f.endsWith(".controller.ts"));
      for (const pFile of possibleFiles) {
        const pContent = fs.readFileSync(path.join(controllersDir, pFile), "utf-8");
        if (pContent.includes(`export async function ${fnName}`)) {
          controllerFileName = pFile.replace(".ts", "");
          break;
        }
      }
    }

    if (controllerFileName) {
      content = `import { ${fnName} } from "./${controllerFileName}";\n${content}`;
    } else {
      console.log(`Could not find controller for ${fnName} in ${file}`);
    }

    content = content.replace(
      new RegExp(`TemplateRow(?:s|Charges)Controller\\.${fnName}\\(`, "g"),
      `${fnName}(`,
    );
  }

  fs.writeFileSync(filePath, content, "utf-8");
}
