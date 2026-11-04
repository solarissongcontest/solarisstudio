import { useFanSession, useMyPredictionHistory } from "@/lib/prediction-data";
import { V3Screen, V3ScreenHeader, V3Surface } from "./V3Foundation";
import { V3PredictionsScreen } from "./V3PredictionsScreen";

/**
 * Authenticated prediction history participates in round-state projection.
 * Do not mount the editable/current-state hub with an empty placeholder history
 * while the caller's private submission state is still loading or unavailable.
 */
export function V3PredictionsRouteContent() {
  const session = useFanSession();
  const viewerId = session.data?.id ?? null;
  const history = useMyPredictionHistory(viewerId ?? undefined);

  const privateStateLoading = session.isLoading || Boolean(viewerId && history.isLoading);
  const privateStateFailed = session.isError || Boolean(viewerId && history.isError);

  if (privateStateLoading || privateStateFailed) {
    return (
      <V3Screen className="pb-8">
        <V3ScreenHeader
          kicker="Play"
          title="Predictions"
          description="Make private predictions, follow their scoring, and see the opt-in Prediction League."
        />
        <V3Surface>
          {privateStateFailed ? (
            <div data-v3-predictions-private-state="error">
              <p className="text-sm font-semibold" role="alert">
                Your private prediction state could not be verified.
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Solaris will not show a round as open or unsubmitted when your saved submission history is unavailable.
              </p>
            </div>
          ) : (
            <p
              data-v3-predictions-private-state="loading"
              role="status"
              aria-live="polite"
              className="text-sm text-[var(--v3-text-secondary)]"
            >
              Loading your prediction state…
            </p>
          )}
        </V3Surface>
      </V3Screen>
    );
  }

  return <V3PredictionsScreen />;
}
