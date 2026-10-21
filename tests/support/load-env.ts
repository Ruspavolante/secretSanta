import { config } from "dotenv";

// I test di integrazione usano le stesse variabili dell'app in locale.
config({ path: ".env.local", quiet: true });
