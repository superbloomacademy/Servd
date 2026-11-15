// Demo mode = this PC with sample venues. The live site runs with SEED_DEMO=false: no demo data, no demo screens.
export const isDemo = () => process.env.SEED_DEMO !== 'false';
