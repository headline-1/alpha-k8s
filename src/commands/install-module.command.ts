
// @TODO convert to command
export const install = async (config: Config, moduleNames: string[]) => {
  for (const name of moduleNames) {
    const module = modules.find(m => m.name === name);
    if (!module) {
      throw new Error(`Module "${name}" not found in available modules.`);
    }
    await module.install(config);
  }
};
