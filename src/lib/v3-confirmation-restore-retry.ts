export type RestoreRequest={_submission_id:string;_version_id:string;_reason:string;p_expected_revision:string;p_operation_id:string;p_idempotency_key:string};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export const restoreRetryKey=(actorId:string,submissionId:string)=>`v3:confirmation-restore:${actorId}:${submissionId}`;
export async function runRetainedConfirmationRestore(input:{actorId:string;submissionId:string;request?:Omit<RestoreRequest,'p_operation_id'|'p_idempotency_key'>;onlyPending?:boolean;storage:Store;submit:(request:RestoreRequest)=>PromiseLike<{data:unknown;error:{message:string;code?:string}|null}>}){
 const key=restoreRetryKey(input.actorId,input.submissionId);const saved=input.storage.getItem(key);
 if(!saved && input.onlyPending)return null;
 let request:RestoreRequest;
 if(saved){request=JSON.parse(saved);if(request._submission_id!==input.submissionId || !/^[a-f0-9]{64}$/.test(request.p_expected_revision) || !request._version_id || !request.p_operation_id || request.p_operation_id!==request.p_idempotency_key)throw new Error('Pending restore identity is invalid. Keep it for recovery.');}
 else{if(!input.request || input.request._submission_id!==input.submissionId || !/^[a-f0-9]{64}$/.test(input.request.p_expected_revision))throw new Error('Refresh this response before reviewing restoration.');const id=crypto.randomUUID();request={...input.request,p_operation_id:id,p_idempotency_key:id};input.storage.setItem(key,JSON.stringify(request));}
 if(input.request && (request._version_id!==input.request._version_id || request._reason!==input.request._reason || request.p_expected_revision!==input.request.p_expected_revision))throw new Error('Recover the previous restore before reviewing another change.');
 const {data,error}=await input.submit(request);
 if(error){if(error.code==='PT409'&&error.message==='VERSION_CONFLICT')input.storage.removeItem(key);throw Object.assign(new Error(error.message),{code:error.code});}
 if(!data||typeof data!=='object'||!('ok'in data)||data.ok!==true||!('operationId'in data)||data.operationId!==request.p_operation_id)throw new Error('Restore outcome is unconfirmed. Retry the retained operation.');
 input.storage.removeItem(key);return data;
}
