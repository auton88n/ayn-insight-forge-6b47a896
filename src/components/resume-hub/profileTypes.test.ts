import { describe, expect, it } from "vitest";
import { EMPTY, mapResumeToCareer } from "./profileTypes";

const resume = {
  basics: { name: "A Person", title: "Product Lead" },
  work: [
    { company: "Now Co", title: "Lead", start: "08/2023", end: "Present", bullets: ["Did a thing"] },
    { company: "Old Co", title: "Analyst", start: "2019", end: "2023", bullets: [] },
  ],
  skills: ["Python", "SQL"],
  education: [{ school: "State U", degree: "BSc" }],
  certifications: [],
};

describe("mapResumeToCareer", () => {
  it("marks a role ending in Present as current and drops the word from the end date", () => {
    const c = mapResumeToCareer(resume as never, EMPTY as never);
    expect(c.experiences[0].current).toBe(true);
    expect(c.experiences[0].end).toBeUndefined();
    expect(c.experiences[1].current).toBe(false);
    expect(c.experiences[1].end).toBe("2023");
  });

  it("keeps the level and years a person already set for a skill that is still on the resume", () => {
    const prev = { ...EMPTY, skills: [{ name: "python", level: "advanced", years: 6, last_used: null }] } as never;
    const c = mapResumeToCareer(resume as never, prev);
    expect(c.skills.find(s => s.name === "Python")?.level).toBe("advanced");
    expect(c.skills.find(s => s.name === "Python")?.years).toBe(6);
    expect(c.skills.find(s => s.name === "SQL")?.level).toBeNull();
  });
});
