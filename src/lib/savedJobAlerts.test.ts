import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendSavedJobAlerts } from "../../supabase/functions/welcome-email-worker/savedJobAlerts";
const { send }=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("../../supabase/functions/_shared/emailTemplate.ts",async(importOriginal)=>({
  ...await importOriginal<typeof import("../../supabase/functions/_shared/emailTemplate.ts")>(),sendBrandedEmail:send,
}));
const alert={id:"alert-id",user_id:"owner",job_id:"saved",attempts:1,title:"<script>bad()</script>",company:"Example",send_payload:null,send_started_at:null};
function client(row:Record<string,unknown>={...alert},sendable=true) {
  const patches:Record<string,unknown>[]=[];
  const logs:Record<string,unknown>[]=[];
  const chain={eq:vi.fn(()=>chain),select:vi.fn(()=>chain),maybeSingle:vi.fn(async()=>({data:{id:alert.id},error:null}))};
  return { patches,logs,admin:{
    rpc:vi.fn(async(name:string)=>({data:name==="claim_saved_job_alerts"?[row]:sendable,error:null})),
    auth:{admin:{getUserById:vi.fn(async()=>({data:{user:{email:"delivered+ayn@resend.dev",email_confirmed_at:"2026-10-09"}},error:null}))}},
    from:vi.fn(()=>({update:(p:Record<string,unknown>)=>{patches.push(p);return chain;},insert:async(p:Record<string,unknown>)=>{logs.push(p);return {error:null};}})),
  }};
}
describe("saved job removal email worker",()=>{
  beforeEach(()=>send.mockReset());
  it("escapes posting text, uses an idempotency key and logs success",async()=>{
    send.mockResolvedValue({ok:true,id:"resend-test"});
    const c=client();
    expect(await sendSavedJobAlerts(c.admin as never)).toMatchObject({sent:1});
    expect(send).toHaveBeenCalledWith("delivered+ayn@resend.dev","An update about your saved job",expect.stringContaining("&lt;script&gt;"),"saved-job/alert-id");
    expect(c.logs[0]).toMatchObject({email_type:"saved_job_removed",status:"sent"});
    expect(c.patches.at(-1)).toMatchObject({status:"sent"});
  });
  it("never emails a cancelled preference, applied job or restored listing",async()=>{
    const c=client({...alert},false);
    expect(await sendSavedJobAlerts(c.admin as never)).toMatchObject({skipped:1});
    expect(send).not.toHaveBeenCalled();
  });
  it("stops uncertain sends beyond provider deduplication lifetime",async()=>{
    const c=client({...alert,send_started_at:"2020-01-01T00:00:00Z"});
    expect(await sendSavedJobAlerts(c.admin as never)).toMatchObject({failed:1});
    expect(send).not.toHaveBeenCalled();
  });
  it("retries transient failures but stops on permanent errors",async()=>{
    send.mockResolvedValue({ok:false,error:"429: throttled"});
    const a=client();
    expect(await sendSavedJobAlerts(a.admin as never)).toMatchObject({retry:1});
    expect(a.patches.at(-1)).toMatchObject({status:"pending"});
    send.mockResolvedValue({ok:false,error:"422: invalid recipient"});
    expect(await sendSavedJobAlerts(client().admin as never)).toMatchObject({failed:1});
  });
});
