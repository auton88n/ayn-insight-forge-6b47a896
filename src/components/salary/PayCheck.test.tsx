import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayCheck } from "./PayCheck";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
describe("PayCheck", () => {
  beforeEach(() => rpc.mockReset());
  it("keeps a completed comparison tied to the submitted amount and currency", async () => {
    rpc.mockResolvedValue({ data: { enough:true,sample:25,median:100000,p10:50000,p90:150000,your_percentile:75,vs_median_pct:20 },error:null });
    render(<PayCheck categories={[]} />);
    fireEvent.change(screen.getByLabelText("Yearly pay", { selector: "input" }),{ target: { value: "120000" } });
    fireEvent.click(screen.getByRole("button",{name:"Compare"}));
    await screen.findByText(/\$120,000 is 20% above/);
    fireEvent.change(screen.getByLabelText("Currency"),{ target: { value: "GBP" } });
    fireEvent.change(screen.getByLabelText("Yearly pay", { selector: "input" }),{ target: { value: "90000" } });
    expect(screen.getByText(/\$120,000 is 20% above/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("recovers from a failed request and rejects figures outside server limits", async () => {
    rpc.mockResolvedValue({ data:null,error:{message:"offline"} });
    render(<PayCheck categories={[]} />);
    const input=screen.getByLabelText("Yearly pay",{selector:"input"});
    fireEvent.change(input,{target:{value:"6000000"}});
    expect(screen.getByRole("button",{name:"Compare"})).toBeDisabled();
    fireEvent.change(input,{target:{value:"100000"}});
    fireEvent.click(screen.getByRole("button",{name:"Compare"}));
    await screen.findByRole("alert");
    await waitFor(()=>expect(screen.getByRole("button",{name:"Compare"})).toBeEnabled());
  });
});
