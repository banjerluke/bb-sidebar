import { useEnvironmentPullRequest } from "./bb-sdk";
import { Tooltip } from "./components/Tooltip";
import { cn } from "./lib/utils";
import { pullRequestStatusLabel, pullRequestToneClass } from "./pull-request-display";

export function ThreadPullRequest({ environmentId }: { environmentId: string | null }) {
  const pullRequest = useEnvironmentPullRequest(environmentId);
  if (!pullRequest) return null;
  return (
    <Tooltip label={`${pullRequest.title}\n${pullRequestStatusLabel(pullRequest)}`} className="whitespace-pre-line">
      <a
        href={pullRequest.url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "pointer-events-auto relative shrink-0 font-mono hover:underline",
          pullRequestToneClass(pullRequest),
        )}
      >
        #{pullRequest.number}
      </a>
    </Tooltip>
  );
}
