export type CombinedDeletionReceiptClient = {rpc:(name:"studio2_reconcile_operation", args:{p_operation_id:string})=>Promise<{data:unknown;error:{code?:string;message:string}|null}>};
type ReceiptRead = () => Promise<{data: unknown; error: {code?:string; message:string} | null}>;
/** Only an actor-scoped, successful receipt for this exact resource permits
 * recovery after the original row has disappeared. Every other failure stays closed. */
export async function recoverCombinedDeletion(id:string, readReceipt:ReceiptRead):Promise<boolean> {
 const {data,error}=await readReceipt();
 if(error){if(error.code==='P0002')return false;throw new Error(error.message);}
 const receipt=data as {command?:string;status?:string;result?:{ok?:boolean;aggregationId?:string}}|null;
 if(!receipt || receipt.command!=='televote.combined.delete' || receipt.status!=='succeeded' || receipt.result?.aggregationId!==id || receipt.result.ok!==true) {
  throw new Error('Combined deletion needs operation reconciliation before retry');
 }
 return true;
}
