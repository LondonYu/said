import type { GuestbookMessage } from './history';
import type { HistoryFeedState } from './historyFeed';
import type { Labels, Language } from './i18n';
import { explorerUrl } from './explorer';

const LAMPORTS_PER_SOL = 1_000_000_000n;

function shortAddress(address: string): string {
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function identityClass(author: string): string {
  const total = [...author].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return `identity-${total % 3}`;
}

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

function formatBlockTime(blockTime: number | null, language: Language): string | null {
  if (blockTime === null) return null;
  const date = new Date(blockTime * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function HistoryPostCard({
  message,
  labels,
  onDetail,
}: {
  message: GuestbookMessage;
  labels: Labels;
  onDetail: () => void;
}) {
  return (
    <article className="preview-post history-post">
      <span className={`preview-avatar ${identityClass(message.author)}`} aria-hidden="true">
        {message.author.slice(-2)}
      </span>
      <div className="preview-body">
        <div className="preview-post-head">
          <strong title={message.author}>{shortAddress(message.author)}</strong>
          <span className="sample-author">{labels.onChainBadge}</span>
          <button
            type="button"
            className="icon-button post-detail"
            aria-label={labels.viewDetails}
            onClick={onDetail}
          >
            ···
          </button>
        </div>
        <p className="preview-post-text">{message.text}</p>
      </div>
    </article>
  );
}

function UnavailablePanel({ feed, labels }: { feed: HistoryFeedState; labels: Labels }) {
  const count = feed.unavailable.length;
  return (
    <section className="history-unavailable" aria-labelledby="unavailable-heading">
      <h2 id="unavailable-heading">{labels.partialUnavailable}</h2>
      <p>{labels.partialUnavailableNote}</p>
      <button
        type="button"
        className="button secondary"
        onClick={feed.retryUnavailable}
        disabled={feed.busy !== null}
      >
        {feed.busy === 'retry'
          ? labels.retrying
          : `${labels.retryUnavailable} (${Math.min(count, 20)})`}
      </button>
      <details className="history-unavailable-list">
        <summary>{labels.unavailableSignatures.replace('{count}', String(count))}</summary>
        <ul>
          {feed.unavailable.map((item) => (
            <li key={item.signature}>
              <code>{item.signature}</code>
              <span>{item.reason}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function HistoryFeedView({
  feed,
  labels,
  note,
  onDetail,
}: {
  feed: HistoryFeedState;
  labels: Labels;
  note: string;
  onDetail: (message: GuestbookMessage) => void;
}) {
  const hasUnavailable = feed.unavailable.length > 0;
  const actionError = feed.actionError;
  const actionErrorText = actionError === null ? null
    : actionError.operation === 'refresh' ? labels.refreshFailed
      : actionError.operation === 'more' ? labels.moreFailed
        : labels.retryFailed;
  const retryFailedAction = () => {
    if (actionError?.operation === 'refresh') feed.refresh();
    else if (actionError?.operation === 'more') feed.loadMore();
    else if (actionError?.operation === 'retry') feed.retryUnavailable();
  };

  return (
    <div className="history-feed" aria-busy={feed.phase === 'loading' || feed.busy !== null}>
      <div className="history-toolbar">
        <p className="preview-banner">{labels.onChainFeed}</p>
        {feed.phase === 'ready' && (
          <button
            type="button"
            className="button secondary history-refresh"
            onClick={feed.refresh}
            disabled={feed.busy !== null}
          >
            {feed.busy === 'refresh' ? labels.refreshing : labels.refresh}
          </button>
        )}
      </div>
      <p className="hint preview-feed-note">{note}</p>

      {feed.phase === 'loading' && (
        <p className="history-status" role="status" aria-live="polite">{labels.historyLoading}</p>
      )}

      {feed.phase === 'error' && (
        <>
          <div className="error" role="alert">
            <p>{labels.historyLoadError}</p>
            {feed.error !== null && (
              <details><summary>{labels.details}</summary><p className="error-detail">{feed.error}</p></details>
            )}
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={feed.refresh}
            disabled={feed.busy === 'refresh'}
          >
            {feed.busy === 'refresh' ? labels.refreshing : labels.retry}
          </button>
        </>
      )}

      {feed.phase === 'ready' && (
        <>
          {feed.messages.length > 0 && (
            <div className="history-posts">
              {feed.messages.map((message) => (
                <HistoryPostCard
                  key={message.signature}
                  message={message}
                  labels={labels}
                  onDetail={() => onDetail(message)}
                />
              ))}
            </div>
          )}

          {feed.messages.length === 0 && !hasUnavailable && feed.exhausted && (
            <p className="preview-empty">{labels.historyEmpty}</p>
          )}
          {feed.messages.length === 0 && !hasUnavailable && !feed.exhausted && (
            <p className="preview-empty">{labels.historyFilteredPage}</p>
          )}

          {hasUnavailable && <UnavailablePanel feed={feed} labels={labels} />}


          {actionError !== null && actionErrorText !== null && (
            <div className="notice history-action-error" role="alert">
              <p>{actionErrorText}</p>
              <details><summary>{labels.details}</summary><p className="error-detail">{actionError.message}</p></details>
              <button type="button" className="button secondary" onClick={retryFailedAction} disabled={feed.busy !== null}>
                {labels.retry}
              </button>
            </div>
          )}

          {feed.loopStopped && (
            <div className="notice history-loop" role="alert">
              <p>{labels.cursorLoop}</p>
              <button type="button" className="button secondary" onClick={feed.refresh} disabled={feed.busy !== null}>
                {labels.refresh}
              </button>
            </div>
          )}

          <div className="history-footer">
            {feed.busy === 'more' && <p className="hint" role="status">{labels.loadingMore}</p>}
            {feed.busy === 'refresh' && <p className="hint" role="status">{labels.refreshing}</p>}
            {feed.hasMore && feed.busy !== 'more' && (
              <button type="button" className="button secondary history-more" onClick={feed.loadMore} disabled={feed.busy !== null}>
                {labels.loadMore}
              </button>
            )}
            {feed.exhausted && !feed.hasMore && !hasUnavailable && (
              <p className="hint history-end">{labels.sourceEnd}</p>
            )}
            {feed.exhausted && !feed.hasMore && hasUnavailable && (
              <p className="hint history-end">{labels.sourceEndWithUnavailable}</p>
            )}
          </div>
          {feed.scanned !== null && <p className="hint history-scanned">{labels.scannedHint.replace('{count}', String(feed.scanned))}</p>}
        </>
      )}
    </div>
  );
}


export function HistorySearch({
  labels,
  messages,
  query,
  onQuery,
  scopeLabel,
  onDetail,
}: {
  labels: Labels;
  messages: readonly GuestbookMessage[];
  query: string;
  onQuery: (value: string) => void;
  scopeLabel: string;
  onDetail: (message: GuestbookMessage) => void;
}) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle === ''
    ? messages
    : messages.filter((message) => `${message.text} ${message.author}`.toLocaleLowerCase().includes(needle));

  return (
    <>
      <p className="preview-banner">{scopeLabel}</p>
      <label className="section-label" htmlFor="history-search">{labels.searchLoaded}</label>
      <input
        autoFocus
        id="history-search"
        className="sample-search"
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <p className="hint">{labels.searchLoadedHint.replace('{count}', String(messages.length))}</p>
      {messages.length === 0 && <p className="preview-empty">{labels.searchNoData}</p>}
      {messages.length > 0 && filtered.length === 0 && (
        <p className="preview-empty">{labels.noLoadedMatches}</p>
      )}
      {filtered.length > 0 && (
        <div className="history-search-results">
          {filtered.map((message) => (
            <HistoryPostCard
              key={message.signature}
              message={message}
              labels={labels}
              onDetail={() => onDetail(message)}
            />
          ))}
        </div>
      )}
    </>
  );
}


export function HistoryDetail({
  message,
  labels,
  language,
}: {
  message: GuestbookMessage;
  labels: Labels;
  language: Language;
}) {
  const time = formatBlockTime(message.blockTime, language);
  const explorer = explorerUrl(message.signature);
  return (
    <div className="preview-detail history-detail">
      <p className="preview-banner">{labels.onChainFeed}</p>
      <p className="hint">{labels.detailNote}</p>
      <div className="preview-detail-author">
        <span className={`preview-avatar ${identityClass(message.author)}`} aria-hidden="true">
          {message.author.slice(-2)}
        </span>
        <strong>{labels.transactionAuthor}</strong>
      </div>
      <code className="address history-detail-author">{message.author}</code>
      <p className="preview-post-text history-detail-text">{message.text}</p>
      <dl className="tx-facts history-facts">
        <div><dt>{labels.transactionTime}</dt><dd>{time ?? labels.unknownTime}</dd></div>
        <div><dt>{labels.transactionSlot}</dt><dd>{message.slot.toString()}</dd></div>
        <div><dt>{labels.transactionFee}</dt><dd>{message.feeLamports.toString()} lamports · {formatSol(message.feeLamports)} SOL · {labels.networkName}</dd></div>
        <div><dt>{labels.transactionSignature}</dt><dd><code>{message.signature}</code></dd></div>
      </dl>
      <a className="button secondary history-explorer" href={explorer} target="_blank" rel="noopener noreferrer">
        {labels.openInExplorer}
      </a>
    </div>
  );
}
