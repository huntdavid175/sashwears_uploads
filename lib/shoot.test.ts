import { describe, expect, it } from "vitest"

import { planShoot, shotKey } from "./shoot"

const photo = (view: string, image: string) => ({ view, image })
const FRONT_BACK = [
  { key: "front", name: "Front" },
  { key: "back", name: "Back" },
]

describe("planShoot", () => {
  it("gives every colour every shot, borrowing a missing shot's design", () => {
    const plan = planShoot(
      [
        { name: "Black", photos: [photo("front", "black-f"), photo("back", "black-b")] },
        { name: "Wine", photos: [photo("front", "wine-f")] },
      ],
      FRONT_BACK,
    )
    expect(plan.map((p) => `${p.color} ${p.shot.key} ${p.basis}`)).toEqual([
      "Black front photo",
      "Black back photo",
      "Wine front photo",
      "Wine back borrowed",
    ])
    expect(plan[3]).toMatchObject({
      from: "Black",
      inputs: [
        { role: "colour", view: "front", viewName: "Front", image: "wine-f", color: "Wine" },
        { role: "design", view: "back", viewName: "Back", image: "black-b", color: "Black" },
      ],
    })
    expect(plan[1].inputs).toEqual([
      { role: "garment", view: "back", viewName: "Back", image: "black-b", color: "Black" },
    ])
  })

  it("follows the template's own shots: a bag's front, side, back and inside", () => {
    const shots = ["Front", "Side", "Back", "Inside"].map((name) => ({ key: shotKey(name), name }))
    const plan = planShoot(
      [
        {
          name: "Tan",
          photos: [photo("front", "tan-f"), photo("side", "tan-s"), photo("inside", "tan-i")],
        },
        { name: "Black", photos: [photo("front", "black-f"), photo("back", "black-b")] },
      ],
      shots,
    )
    expect(plan.map((p) => `${p.color} ${p.shot.name} ${p.basis} ${p.from ?? ""}`.trim())).toEqual([
      "Tan Front photo",
      "Tan Side photo",
      "Tan Back borrowed Black",
      "Tan Inside photo",
      "Black Front photo",
      "Black Side borrowed Tan",
      "Black Back photo",
      "Black Inside borrowed Tan",
    ])
    // A missing shot sends up to two of the colour's own photos for colour and material.
    expect(plan[2].inputs.map((i) => `${i.role}:${i.image}`)).toEqual([
      "colour:tan-f",
      "colour:tan-s",
      "design:black-b",
    ])
  })

  it("guesses a shot no colour has, and uses up to three photos of a shot", () => {
    const solo = planShoot([{ name: "Green", photos: [photo("front", "g")] }], FRONT_BACK)
    expect(solo[1]).toMatchObject({ basis: "guessed", inputs: [{ role: "colour", image: "g" }] })

    const fronts = ["a", "b", "c", "d"].map((x) => photo("front", x))
    const [front] = planShoot([{ name: "Black", photos: fronts }], FRONT_BACK)
    expect(front.inputs.map((i) => i.image)).toEqual(["a", "b", "c"])
  })

  it("makes file-safe shot keys", () => {
    expect(shotKey("Three-quarter (left)")).toBe("three-quarter-left")
    expect(shotKey("  ")).toBe("shot")
  })
})
