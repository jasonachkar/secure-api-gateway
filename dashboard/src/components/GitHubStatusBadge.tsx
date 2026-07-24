/**
 * Fetches the latest GitHub Actions run status and last commit date for the public repo,
 * straight from GitHub's public REST API (no auth needed for public read-only data, and
 * GitHub serves these endpoints with CORS enabled). Fetched once on mount, not polled -
 * unauthenticated GitHub API calls are capped at 60/hour per IP, and a build's status
 * doesn't change often enough to justify polling anyway.
 */

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react';

const REPO = 'jasonachkar/secure-api-gateway';
const REPO_URL = `https://github.com/${REPO}`;

type BuildStatus = 'loading' | 'passing' | 'failing' | 'unknown';

export function GitHubStatusBadge() {
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('loading');
  const [lastCommitDate, setLastCommitDate] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [runsRes, commitsRes] = await Promise.all([
          fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=1`),
          fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`),
        ]);

        if (!cancelled && runsRes.ok) {
          const runsData = await runsRes.json();
          const latestRun = runsData.workflow_runs?.[0];
          if (latestRun) {
            setBuildStatus(latestRun.conclusion === 'success' ? 'passing' : latestRun.conclusion === 'failure' ? 'failing' : 'unknown');
          } else {
            setBuildStatus('unknown');
          }
        } else if (!cancelled) {
          setBuildStatus('unknown');
        }

        if (!cancelled && commitsRes.ok) {
          const commitsData = await commitsRes.json();
          const date = commitsData[0]?.commit?.author?.date;
          if (date) setLastCommitDate(new Date(date));
        }
      } catch {
        if (!cancelled) setBuildStatus('unknown');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="github-status">
      <div className="github-status__row">
        <span className="threat-card__meta-label">Build Status</span>
        <span className={`github-status__build github-status__build--${buildStatus}`}>
          {buildStatus === 'loading' && <Loader2 size={14} className="simulator-spin" aria-hidden="true" />}
          {buildStatus === 'passing' && <CheckCircle2 size={14} aria-hidden="true" />}
          {buildStatus === 'failing' && <XCircle size={14} aria-hidden="true" />}
          {buildStatus === 'loading' && 'Checking…'}
          {buildStatus === 'passing' && 'Passing'}
          {buildStatus === 'failing' && 'Failing'}
          {buildStatus === 'unknown' && 'Status unavailable'}
        </span>
      </div>
      <div className="github-status__row">
        <span className="threat-card__meta-label">Last Updated</span>
        <span className="text-sm">
          {lastCommitDate ? formatDistanceToNow(lastCommitDate, { addSuffix: true }) : '—'}
        </span>
      </div>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="github-status__link">
        View Source on GitHub <ExternalLink size={12} aria-hidden="true" />
      </a>
    </div>
  );
}
