/**
 * Algoritmo di estrazione del Secret Santa.
 *
 * Il problema è trovare una permutazione dei partecipanti (chi regala → chi riceve)
 * che rispetti tre vincoli: nessuno regala a sé stesso, ognuno riceve esattamente
 * un regalo e nessuna coppia esclusa viene estratta. In termini di grafi è un
 * "perfect matching" in un grafo bipartito (regalatori ↔ destinatari).
 *
 * 1. `checkFeasibility` calcola un matching massimo (cammini aumentanti di Kuhn):
 *    se non copre tutti, nessuna estrazione è possibile e il teorema di Hall
 *    permette di indicare il gruppo di persone che causa il problema.
 * 2. `drawAssignments` cerca un'estrazione casuale con backtracking
 *    (euristica MRV + forward checking). Se la ricerca supera il budget di passi,
 *    ripiega su un matching casuale che, a fattibilità verificata, esiste sempre.
 * 3. Il risultato viene comunque rivalidato con `validateAssignments` prima di
 *    essere restituito (e di nuovo dal database in `save_draw`).
 */

export const MIN_PARTICIPANTS = 3;

export type DrawParticipant = { id: string; name: string };
export type Exclusion = { giverId: string; receiverId: string };
export type Pair = { giverId: string; receiverId: string };

export type DrawInput = {
  participants: DrawParticipant[];
  exclusions: Exclusion[];
};

export type FeasibilityProblem =
  | { kind: "too_few"; count: number; min: number }
  | { kind: "duplicate_ids" }
  | { kind: "no_receivers"; giver: string }
  | { kind: "no_givers"; receiver: string }
  | { kind: "hall"; givers: string[]; receivers: string[] };

export type FeasibilityResult =
  | { feasible: true }
  | { feasible: false; problems: FeasibilityProblem[] };

export type DrawResult =
  | { ok: true; pairs: Pair[] }
  | { ok: false; problems: FeasibilityProblem[] };

/** Restituisce un intero casuale in [0, max). */
export type RandomInt = (max: number) => number;

/** Generatore casuale crittografico con rejection sampling (nessun bias da modulo). */
export const cryptoRandomInt: RandomInt = (max) => {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError("max deve essere un intero positivo");
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
};

function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Per ogni partecipante, l'elenco dei destinatari consentiti (indici). */
function buildAllowed(input: DrawInput): number[][] {
  const index = new Map(input.participants.map((p, i) => [p.id, i]));
  const n = input.participants.length;
  const blocked = Array.from({ length: n }, () => new Set<number>());
  for (const ex of input.exclusions) {
    const g = index.get(ex.giverId);
    const r = index.get(ex.receiverId);
    if (g !== undefined && r !== undefined) blocked[g].add(r);
  }
  return Array.from({ length: n }, (_, g) => {
    const allowed: number[] = [];
    for (let r = 0; r < n; r++) {
      if (r !== g && !blocked[g].has(r)) allowed.push(r);
    }
    return allowed;
  });
}

/**
 * Matching massimo con cammini aumentanti (algoritmo di Kuhn).
 * `matchOfReceiver[r]` è il regalatore abbinato al destinatario r, oppure -1.
 */
function maximumMatching(allowed: number[][], giverOrder: number[]): number[] {
  const n = allowed.length;
  const matchOfReceiver = new Array<number>(n).fill(-1);

  const tryAugment = (giver: number, visited: boolean[]): boolean => {
    for (const receiver of allowed[giver]) {
      if (visited[receiver]) continue;
      visited[receiver] = true;
      if (matchOfReceiver[receiver] === -1 || tryAugment(matchOfReceiver[receiver], visited)) {
        matchOfReceiver[receiver] = giver;
        return true;
      }
    }
    return false;
  };

  for (const giver of giverOrder) {
    tryAugment(giver, new Array<boolean>(n).fill(false));
  }
  return matchOfReceiver;
}

/**
 * Dato un regalatore non abbinabile, trova (via cammini alternanti) un gruppo di
 * regalatori che insieme possono regalare a meno persone di quante sono:
 * la violazione della condizione di Hall che rende impossibile l'estrazione.
 */
function findHallViolation(allowed: number[][], matchOfReceiver: number[], unmatchedGiver: number) {
  const givers = new Set<number>([unmatchedGiver]);
  const receivers = new Set<number>();
  const queue = [unmatchedGiver];
  while (queue.length > 0) {
    const giver = queue.shift()!;
    for (const receiver of allowed[giver]) {
      if (receivers.has(receiver)) continue;
      receivers.add(receiver);
      const next = matchOfReceiver[receiver];
      if (next !== -1 && !givers.has(next)) {
        givers.add(next);
        queue.push(next);
      }
    }
  }
  return { givers: [...givers], receivers: [...receivers] };
}

export function checkFeasibility(input: DrawInput): FeasibilityResult {
  const { participants } = input;
  const n = participants.length;

  if (n < MIN_PARTICIPANTS) {
    return { feasible: false, problems: [{ kind: "too_few", count: n, min: MIN_PARTICIPANTS }] };
  }
  if (new Set(participants.map((p) => p.id)).size !== n) {
    return { feasible: false, problems: [{ kind: "duplicate_ids" }] };
  }

  const allowed = buildAllowed(input);
  const problems: FeasibilityProblem[] = [];

  allowed.forEach((receivers, giver) => {
    if (receivers.length === 0) problems.push({ kind: "no_receivers", giver: participants[giver].name });
  });
  const reachable = new Set(allowed.flat());
  participants.forEach((p, receiver) => {
    if (!reachable.has(receiver)) problems.push({ kind: "no_givers", receiver: p.name });
  });
  if (problems.length > 0) return { feasible: false, problems };

  const order = participants.map((_, i) => i);
  const matchOfReceiver = maximumMatching(allowed, order);
  const matchedGivers = new Set(matchOfReceiver.filter((g) => g !== -1));
  if (matchedGivers.size === n) return { feasible: true };

  const unmatched = order.find((g) => !matchedGivers.has(g))!;
  const violation = findHallViolation(allowed, matchOfReceiver, unmatched);
  return {
    feasible: false,
    problems: [
      {
        kind: "hall",
        givers: violation.givers.map((i) => participants[i].name).sort((a, b) => a.localeCompare(b, "it")),
        receivers: violation.receivers.map((i) => participants[i].name).sort((a, b) => a.localeCompare(b, "it")),
      },
    ],
  };
}

/**
 * Backtracking casuale. Restituisce l'assegnazione (receiver per giver) oppure
 * null se il budget di passi si esaurisce.
 */
function backtrack(allowed: number[][], randomInt: RandomInt, maxSteps: number): number[] | null {
  const n = allowed.length;
  const receiverOf = new Array<number>(n).fill(-1);
  const taken = new Array<boolean>(n).fill(false);
  let steps = 0;

  const available = (giver: number) => allowed[giver].filter((r) => !taken[r]);

  const solve = (assigned: number): boolean => {
    if (assigned === n) return true;
    if (++steps > maxSteps) return false;

    // MRV: scegli il regalatore con meno destinatari ancora liberi.
    let chosen = -1;
    let chosenOptions: number[] = [];
    for (let g = 0; g < n; g++) {
      if (receiverOf[g] !== -1) continue;
      const options = available(g);
      if (options.length === 0) return false; // vicolo cieco: forward checking
      if (chosen === -1 || options.length < chosenOptions.length) {
        chosen = g;
        chosenOptions = options;
      }
    }

    for (const receiver of shuffle(chosenOptions, randomInt)) {
      receiverOf[chosen] = receiver;
      taken[receiver] = true;
      if (solve(assigned + 1)) return true;
      receiverOf[chosen] = -1;
      taken[receiver] = false;
      if (steps > maxSteps) return false;
    }
    return false;
  };

  return solve(0) ? receiverOf : null;
}

export type DrawOptions = {
  randomInt?: RandomInt;
  /** Budget di passi per ogni tentativo di backtracking. */
  maxSteps?: number;
  /** Numero di tentativi di backtracking prima del ripiego sul matching casuale. */
  attempts?: number;
};

export function drawAssignments(input: DrawInput, options: DrawOptions = {}): DrawResult {
  const { randomInt = cryptoRandomInt, maxSteps = 50_000, attempts = 3 } = options;

  const feasibility = checkFeasibility(input);
  if (!feasibility.feasible) return { ok: false, problems: feasibility.problems };

  const allowed = buildAllowed(input);
  const { participants } = input;

  let receiverOf: number[] | null = null;
  for (let attempt = 0; attempt < attempts && !receiverOf; attempt++) {
    receiverOf = backtrack(allowed, randomInt, maxSteps);
  }

  if (!receiverOf) {
    // Ripiego: matching casuale. Esiste sicuramente perché la fattibilità è verificata.
    const shuffledAllowed = allowed.map((receivers) => shuffle(receivers, randomInt));
    const order = shuffle(participants.map((_, i) => i), randomInt);
    const matchOfReceiver = maximumMatching(shuffledAllowed, order);
    receiverOf = new Array<number>(participants.length).fill(-1);
    matchOfReceiver.forEach((giver, receiver) => {
      if (giver !== -1) receiverOf![giver] = receiver;
    });
  }

  const pairs = receiverOf.map((receiver, giver) => ({
    giverId: participants[giver].id,
    receiverId: participants[receiver]?.id ?? "",
  }));

  const errors = validateAssignments(input, pairs);
  if (errors.length > 0) {
    // Non dovrebbe mai accadere: meglio fallire che salvare un risultato invalido.
    throw new Error(`Estrazione non valida generata: ${errors.join("; ")}`);
  }
  return { ok: true, pairs };
}

/** Restituisce l'elenco degli errori (vuoto se l'estrazione è valida). */
export function validateAssignments(input: DrawInput, pairs: Pair[]): string[] {
  const errors: string[] = [];
  const ids = new Set(input.participants.map((p) => p.id));
  const excluded = new Set(input.exclusions.map((e) => `${e.giverId}→${e.receiverId}`));
  const givers = new Set<string>();
  const receivers = new Set<string>();

  if (input.participants.length < MIN_PARTICIPANTS) errors.push("partecipanti insufficienti");
  if (pairs.length !== ids.size) errors.push("numero di abbinamenti diverso dal numero di partecipanti");

  for (const { giverId, receiverId } of pairs) {
    if (!ids.has(giverId)) errors.push(`regalatore sconosciuto: ${giverId}`);
    if (!ids.has(receiverId)) errors.push(`destinatario sconosciuto: ${receiverId}`);
    if (giverId === receiverId) errors.push(`auto-assegnazione: ${giverId}`);
    if (givers.has(giverId)) errors.push(`regalatore ripetuto: ${giverId}`);
    if (receivers.has(receiverId)) errors.push(`destinatario ripetuto: ${receiverId}`);
    if (excluded.has(`${giverId}→${receiverId}`)) errors.push(`esclusione violata: ${giverId}→${receiverId}`);
    givers.add(giverId);
    receivers.add(receiverId);
  }
  for (const id of ids) {
    if (!givers.has(id)) errors.push(`partecipante senza destinatario: ${id}`);
    if (!receivers.has(id)) errors.push(`partecipante senza regalo: ${id}`);
  }
  return errors;
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;

/** Messaggio comprensibile per l'organizzatore. */
export function describeProblem(problem: FeasibilityProblem): string {
  switch (problem.kind) {
    case "too_few":
      return `Servono almeno ${problem.min} partecipanti per un Secret Santa (ora ${problem.count === 1 ? "ce n'è 1" : `ce ne sono ${problem.count}`}).`;
    case "duplicate_ids":
      return "Ci sono partecipanti duplicati: ricarica la pagina e riprova.";
    case "no_receivers":
      return `${problem.giver} non può regalare a nessuno: le esclusioni coprono tutti gli altri partecipanti.`;
    case "no_givers":
      return `Nessuno può fare il regalo a ${problem.receiver}: tutti gli altri hanno un'esclusione verso questa persona.`;
    case "hall": {
      const people = list(problem.givers);
      const targets = list(problem.receivers);
      return `${people} (${problem.givers.length} persone) possono regalare solo a ${targets} (${problem.receivers.length} ${problem.receivers.length === 1 ? "persona" : "persone"}): non bastano per tutti. Rimuovi qualche esclusione che riguarda queste persone.`;
    }
  }
}
