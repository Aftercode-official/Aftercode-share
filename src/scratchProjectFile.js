import JSZip from "jszip";

export const MAX_SCRATCH_PROJECT_SIZE = 50 * 1024 * 1024;

export async function validateScratchProjectFile(file) {
  if (!file?.name?.toLowerCase().endsWith(".sb3")) {
    throw new Error("Choose a Scratch project file ending in .sb3.");
  }
  if (file.size === 0 || file.size > MAX_SCRATCH_PROJECT_SIZE) {
    throw new Error("The .sb3 file must be between 1 byte and 50 MB.");
  }

  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (header[0] !== 0x50 || header[1] !== 0x4b) {
    throw new Error("This file does not look like a valid Scratch .sb3 archive.");
  }

  let archive;
  try {
    archive = await JSZip.loadAsync(file);
  } catch {
    throw new Error("This .sb3 archive could not be opened.");
  }
  const projectFile = archive.file("project.json");
  if (!projectFile) {
    throw new Error("This .sb3 archive does not contain a Scratch project.json file.");
  }

  let projectData;
  try {
    projectData = JSON.parse(await projectFile.async("string"));
  } catch {
    throw new Error("The project.json file in this .sb3 archive is invalid.");
  }
  if (!Array.isArray(projectData.targets) || projectData.targets.length === 0) {
    throw new Error("This file does not contain any Scratch sprites or stage.");
  }
}
