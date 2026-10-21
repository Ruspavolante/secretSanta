import { describe, expect, it } from "vitest";
import {
  checkFeasibility,
  cryptoRandomInt,
  describeProblem,
  drawAssignments,
  validateAssignments,
  type DrawInput,
  type Exclusion,
  type RandomInt,
} from "@/lib/draw/algorithm";

/** Generatore deterministico (mulberry32) per test riproducibili. */
function seeded(seed: number): RandomInt {
  let a = seed >>> 0;
  return (max) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(value * max);
  };
}

function people(...names: string[]) {
  return names.map((name) => ({ id: name.toLowerCase(), name }));
}

function both(a: string, b: string): Exclusion[] {
  return [
    { giverId: a, receiverId: b },
    { giverId: b, receiverId: a },
  ];
}

function expectValid(input: DrawInput, seed?: number) {
  const result = drawAssignments(input, seed === undefined ? {} : { randomInt: seeded(seed) });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("estrazione fallita");
  expect(validateAssignments(input, result.pairs)).toEqual([]);
  return result.pairs;
}

describe("drawAssignments", () => {
  const five = people("Mario", "Giulia", "Luca", "Sara", "Paolo");

  it("non assegna mai una persona a sé stessa", () => {
    for (let seed = 0; seed < 300; seed++) {
      const pairs = expectValid({ participants: five, exclusions: [] }, seed);
      for (const pair of pairs) expect(pair.giverId).not.toBe(pair.receiverId);
    }
  });

  it("ogni partecipante regala una volta e riceve esattamente un regalo (destinatari unici)", () => {
    for (let seed = 0; seed < 300; seed++) {
      const pairs = expectValid({ participants: five, exclusions: [] }, seed);
      const givers = pairs.map((p) => p.giverId);
      const receivers = pairs.map((p) => p.receiverId);
      expect(new Set(givers).size).toBe(five.length);
      expect(new Set(receivers).size).toBe(five.length);
      expect([...receivers].sort()).toEqual(five.map((p) => p.id).sort());
    }
  });

  it("rispetta le esclusioni in una e in entrambe le direzioni", () => {
    const exclusions: Exclusion[] = [
      ...both("mario", "giulia"),
      { giverId: "luca", receiverId: "sara" },
      { giverId: "paolo", receiverId: "mario" },
    ];
    for (let seed = 0; seed < 300; seed++) {
      const pairs = expectValid({ participants: five, exclusions }, seed);
      for (const ex of exclusions) {
        expect(pairs).not.toContainEqual({ giverId: ex.giverId, receiverId: ex.receiverId });
      }
    }
  });

  it("trova l'unica soluzione valida quando i vincoli la impongono", () => {
    // A→B→C→A è l'unico ciclo possibile.
    const abc = people("A", "B", "C");
    const exclusions: Exclusion[] = [
      { giverId: "a", receiverId: "c" },
      { giverId: "b", receiverId: "a" },
      { giverId: "c", receiverId: "b" },
    ];
    for (let seed = 0; seed < 50; seed++) {
      const pairs = expectValid({ participants: abc, exclusions }, seed);
      expect(pairs).toEqual(
        expect.arrayContaining([
          { giverId: "a", receiverId: "b" },
          { giverId: "b", receiverId: "c" },
          { giverId: "c", receiverId: "a" },
        ]),
      );
    }
  });

  it("produce estrazioni diverse (è casuale)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const pairs = expectValid({ participants: five, exclusions: [] });
      seen.add(pairs.map((p) => `${p.giverId}>${p.receiverId}`).join(","));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it("gestisce gruppi grandi con molte esclusioni", () => {
    const big = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `Persona ${i}` }));
    const exclusions: Exclusion[] = [];
    // Ognuno esclude i 20 successivi: restano comunque soluzioni valide.
    for (let i = 0; i < big.length; i++) {
      for (let k = 1; k <= 20; k++) exclusions.push({ giverId: `p${i}`, receiverId: `p${(i + k) % big.length}` });
    }
    expectValid({ participants: big, exclusions }, 7);
  });

  it("ripiega sul matching casuale se il backtracking esaurisce il budget, restando valido", () => {
    const group = people("A", "B", "C", "D", "E", "F", "G", "H");
    const exclusions = [...both("a", "b"), ...both("c", "d"), { giverId: "e", receiverId: "f" }];
    const input = { participants: group, exclusions };
    const result = drawAssignments(input, { randomInt: seeded(3), maxSteps: 1, attempts: 1 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(validateAssignments(input, result.pairs)).toEqual([]);
  });
});

describe("checkFeasibility", () => {
  it("riconosce che servono almeno 3 partecipanti", () => {
    const result = checkFeasibility({ participants: people("A", "B"), exclusions: [] });
    expect(result).toEqual({ feasible: false, problems: [{ kind: "too_few", count: 2, min: 3 }] });
    expect(drawAssignments({ participants: people("A", "B"), exclusions: [] }).ok).toBe(false);
  });

  it("individua chi non può regalare a nessuno", () => {
    const input = {
      participants: people("A", "B", "C"),
      exclusions: [
        { giverId: "a", receiverId: "b" },
        { giverId: "a", receiverId: "c" },
      ],
    };
    const result = checkFeasibility(input);
    expect(result.feasible).toBe(false);
    if (!result.feasible) expect(result.problems).toContainEqual({ kind: "no_receivers", giver: "A" });
  });

  it("individua chi non può ricevere da nessuno", () => {
    const input = {
      participants: people("A", "B", "C"),
      exclusions: [
        { giverId: "b", receiverId: "a" },
        { giverId: "c", receiverId: "a" },
      ],
    };
    const result = checkFeasibility(input);
    expect(result.feasible).toBe(false);
    if (!result.feasible) expect(result.problems).toContainEqual({ kind: "no_givers", receiver: "A" });
  });

  it("individua un gruppo che viola la condizione di Hall", () => {
    // A e B possono regalare solo a C: due persone, un solo destinatario.
    const input = {
      participants: people("A", "B", "C", "D"),
      exclusions: [
        { giverId: "a", receiverId: "b" },
        { giverId: "a", receiverId: "d" },
        { giverId: "b", receiverId: "a" },
        { giverId: "b", receiverId: "d" },
      ],
    };
    const result = checkFeasibility(input);
    expect(result).toEqual({ feasible: false, problems: [{ kind: "hall", givers: ["A", "B"], receivers: ["C"] }] });
    const draw = drawAssignments(input);
    expect(draw.ok).toBe(false);
  });

  it("con 3 persone e una coppia esclusa in entrambe le direzioni non esiste soluzione", () => {
    const input = { participants: people("A", "B", "C"), exclusions: both("a", "b") };
    const result = drawAssignments(input);
    expect(result.ok).toBe(false);
  });

  it("conferma la fattibilità quando esiste una soluzione", () => {
    const input = { participants: people("A", "B", "C", "D"), exclusions: [...both("a", "b"), ...both("c", "d")] };
    expect(checkFeasibility(input)).toEqual({ feasible: true });
  });

  it("ignora esclusioni che riguardano persone non presenti", () => {
    const input = { participants: people("A", "B", "C"), exclusions: [{ giverId: "x", receiverId: "a" }] };
    expect(checkFeasibility(input)).toEqual({ feasible: true });
  });
});

describe("validateAssignments", () => {
  const abc = people("A", "B", "C");
  const input = { participants: abc, exclusions: [{ giverId: "a", receiverId: "c" }] };

  it("accetta un'estrazione corretta", () => {
    const pairs = [
      { giverId: "a", receiverId: "b" },
      { giverId: "b", receiverId: "c" },
      { giverId: "c", receiverId: "a" },
    ];
    expect(validateAssignments(input, pairs)).toEqual([]);
  });

  it("rifiuta auto-assegnazioni, destinatari ripetuti, esclusioni violate e partecipanti mancanti", () => {
    expect(validateAssignments(input, [{ giverId: "a", receiverId: "a" }, { giverId: "b", receiverId: "c" }, { giverId: "c", receiverId: "b" }]).join()).toMatch(/auto-assegnazione/);
    expect(validateAssignments(input, [{ giverId: "a", receiverId: "b" }, { giverId: "b", receiverId: "a" }, { giverId: "c", receiverId: "a" }]).join()).toMatch(/destinatario ripetuto/);
    expect(validateAssignments(input, [{ giverId: "a", receiverId: "c" }, { giverId: "b", receiverId: "a" }, { giverId: "c", receiverId: "b" }]).join()).toMatch(/esclusione violata/);
    expect(validateAssignments(input, [{ giverId: "a", receiverId: "b" }, { giverId: "b", receiverId: "a" }]).join()).toMatch(/senza destinatario/);
  });
});

describe("describeProblem", () => {
  it("produce messaggi in italiano comprensibili", () => {
    expect(describeProblem({ kind: "too_few", count: 2, min: 3 })).toContain("almeno 3 partecipanti");
    expect(describeProblem({ kind: "no_receivers", giver: "Mario" })).toContain("Mario non può regalare a nessuno");
    expect(describeProblem({ kind: "no_givers", receiver: "Sara" })).toContain("Nessuno può fare il regalo a Sara");
    expect(describeProblem({ kind: "hall", givers: ["A", "B"], receivers: ["C"] })).toContain("A e B (2 persone) possono regalare solo a C (1 persona)");
  });
});

describe("cryptoRandomInt", () => {
  it("resta nell'intervallo richiesto", () => {
    for (let i = 0; i < 1000; i++) {
      const value = cryptoRandomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
    expect(() => cryptoRandomInt(0)).toThrow();
  });
});
