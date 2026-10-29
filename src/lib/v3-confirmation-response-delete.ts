export type ConfirmationDeleteRequest = {
  _submission_id: string;
  p_expected_revision: string;
  p_operation_id: string;
  p_idempotency_key: string;
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Submit = (request: ConfirmationDeleteRequest) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/** Retain the approved request across uncertain outcomes and page reloads. The
 * actor-scoped key prevents another account from inheriting a pending deletion.
 * Recovery needs neither the deleted response nor a fresh revision preview. */
export async function runConfirmationResponseDelete(input: {
  userId: string;
  submissionId: string;
  expectedRevision?: string;
  onlyPending?: boolean;
  storage: Storage;
  submit: Submit;
}) {
  const key=`v3:confirmation-delete:${input.userId}:${input.submissionId}`;
  const saved=input.storage.getItem(key);
  if(!saved && input.onlyPending) return null;
  let request: ConfirmationDeleteRequest;
  if(saved) {
    request=JSON.parse(saved);
    if(request._submission_id!==input.submissionId || !/^[a-f0-9]{64}$/.test(request.p_expected_revision) || !request.p_operation_id || request.p_idempotency_key!==request.p_operation_id) throw new Error('Pending deletion identity is invalid. Keep it for recovery.');
  } else {
    if(!input.expectedRevision) throw new Error('Refresh the response before reviewing deletion.');
    const operationId=crypto.randomUUID();
    request={_submission_id:input.submissionId,p_expected_revision:input.expectedRevision,p_operation_id:operationId,p_idempotency_key:operationId};
    input.storage.setItem(key,JSON.stringify(request));
  }
  const {data,error}=await input.submit(request);
  if(error) {
    // This exact server error proves the transaction rejected the CAS. Network,
    // authorization and uncertain receipt errors never rotate the operation ID.
    if(error.code==='PT409' && error.message==='VERSION_CONFLICT') input.storage.removeItem(key);
    throw Object.assign(new Error(error.message),{code:error.code});
  }
  if(!data || typeof data!=='object' || !('deleted' in data) || data.deleted!==true || !('submissionId' in data) || data.submissionId!==request._submission_id) throw new Error('Deletion outcome is unconfirmed. Retry the retained operation.');
  input.storage.removeItem(key);
  return data;
}
