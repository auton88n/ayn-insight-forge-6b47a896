import { describe,expect,it } from "vitest";
import { aiTimeout } from "../../supabase/functions/content-engine/timeBudget";
describe("article runtime budget",()=>{
  it("caps one AI attempt and reserves response/persistence time",()=>{
    expect(aiTimeout(45000,0)).toBe(20000);
    expect(aiTimeout(45000,40000)).toBe(3000);
  });
  it("fails explicitly before the edge supervisor can cancel the request",()=>{
    expect(()=>aiTimeout(45000,43000)).toThrow(/budget exhausted/);
  });
});
