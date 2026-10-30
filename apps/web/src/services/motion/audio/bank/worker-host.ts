import { prepareBankPcm } from "./prepare";
import { prepareBankAtlas } from "./atlas";
import { closeAtlas } from "./geometry";
import type { BankJob, BankReply } from "./model";

/** The client admits one finite recipe/atlas job at a time to this retained worker. */
export async function handleBankJob(
  job: BankJob,
  send: (reply: BankReply, transfer?: Transferable[]) => void,
) {
  try {
    if (job.type === "prepare") {
      const value = await prepareBankPcm(job.preset);
      send({ id: job.id, type: "pcm", value }, [value.pcm.buffer]);
      return;
    }
    const value = prepareBankAtlas(job);
    try {
      send({ id: job.id, type: "atlas", value }, [value.neutral, value.active]);
    } catch (error) {
      closeAtlas(value);
      throw error;
    }
  } catch (error) {
    send({
      id: job.id,
      type: "error",
      message: error instanceof Error ? error.message : "Sound-bank preparation failed.",
    });
  }
}
