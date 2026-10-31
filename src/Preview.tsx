import { useState, type ReactNode } from 'react';
import type { Labels } from './i18n';

// 明确标注的静态示例；不是真实用户，也不属于任何已连接钱包，更不是链上历史。
export const samplePosts = [
  { id: 1, author: 'sample.01', text: '今天开始做第一个小项目，先把钱包连接跑通了。' },
  { id: 2, author: 'sample.02', text: '有人在用手机钱包吗？想试一下内置浏览器的效果。' },
  { id: 3, author: 'sample.03', text: '第一次测试中文和 emoji 👋' },
  { id: 4, author: 'sample.01', text: '深色和浅色都试了一遍，我还是习惯浅色。' },
  { id: 5, author: 'sample.02', text: '周五了，晚上准备把剩下的功能看完。' },
  { id: 6, author: 'sample.03', text: '刚整理完手机相册。删掉最多的不是照片，是各种截图。' },
] as const;

export type SamplePost = (typeof samplePosts)[number];

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function draftStats(text: string) {
  const count = [...segmenter.segment(text)].length;
  const bytes = new TextEncoder().encode(text).length;
  return { count, bytes, valid: text.trim().length > 0 && count <= 140 && bytes <= 560 };
}

function filterSamples(query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return samplePosts;
  return samplePosts.filter((post) => `${post.text} ${post.author}`.toLocaleLowerCase().includes(needle));
}

export function PreviewFeed({ labels, onDetail, query = '' }: {
  labels: Labels;
  onDetail: (post: SamplePost) => void;
  query?: string;
}) {
  const posts = filterSamples(query);
  if (posts.length === 0) return <p className="preview-empty">{labels.noMatches}</p>;
  return (
    <>
      {posts.map((post) => (
        <article className="preview-post" key={post.id}>
          <span className={`preview-avatar identity-${post.id % 3}`} aria-hidden="true">{post.author.slice(-2)}</span>
          <div className="preview-body">
            <div className="preview-post-head">
              <strong>{post.author}</strong>
              <span className="sample-author">{labels.sampleAuthor}</span>
              <button
                type="button"
                className="icon-button post-detail"
                aria-label={labels.viewDetails}
                onClick={() => onDetail(post)}
              >
                ···
              </button>
            </div>
            <p className="preview-post-text">{post.text}</p>
          </div>
        </article>
      ))}
    </>
  );
}

export function PreviewSearch({ labels, onDetail }: { labels: Labels; onDetail: (post: SamplePost) => void }) {
  const [query, setQuery] = useState('');
  return (
    <>
      <p className="preview-banner">{labels.sampleLabel}</p>
      <label className="section-label" htmlFor="sample-search">{labels.searchSamples}</label>
      <input
        autoFocus
        id="sample-search"
        className="sample-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="hint">{labels.searchSamplesHint}</p>
      <PreviewFeed labels={labels} onDetail={onDetail} query={query} />
    </>
  );
}

export function PreviewEditor({ labels, draft, onDraft, onCheck, checkDisabled, checking, checkSummary }: {
  labels: Labels;
  draft: string;
  onDraft: (text: string) => void;
  onCheck?: () => void;
  checkDisabled?: boolean;
  checking?: boolean;
  checkSummary?: ReactNode;
}) {
  const [review, setReview] = useState(false);
  const stats = draftStats(draft);

  return (
    <>
      <p className="preview-banner">{labels.localPreview}</p>
      <p className="hint">{labels.previewNote}</p>

      {review ? (
        <>
          <p className="preview-post-text draft-review">{draft}</p>
          <div className="preview-actions">
            <button type="button" className="button secondary" onClick={() => setReview(false)}>{labels.previewBack}</button>
            {onCheck && (
              <button type="button" className="button" onClick={onCheck} disabled={checkDisabled || checking}>
                {checking ? labels.checkingTx : labels.checkTx}
              </button>
            )}
          </div>
          {checkSummary}
        </>
      ) : (
        <>
          <label className="section-label" htmlFor="preview-draft">{labels.previewInput}</label>
          <textarea
            autoFocus
            id="preview-draft"
            className="preview-draft"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            aria-describedby="draft-count draft-limit"
          />
          <div className={`draft-count${stats.valid || draft === '' ? '' : ' invalid'}`} id="draft-count" aria-live="polite">
            <span>{stats.count} / 140 {labels.characters}</span>
            <span>{stats.bytes} / 560 {labels.bytes}</span>
          </div>
          <p className="hint" id="draft-limit">{labels.previewLimit}</p>
          <div className="preview-actions">
            <button
              type="button"
              className="button"
              disabled={!stats.valid}
              onClick={() => { if (stats.valid) setReview(true); }}
            >
              {labels.previewNext}
            </button>
          </div>
        </>
      )}
    </>
  );
}

export function PreviewDetail({ labels, post }: { labels: Labels; post: SamplePost }) {
  return (
    <div className="preview-detail">
      <p className="preview-banner">{labels.localPreview}</p>
      <p className="hint">{labels.sampleFeedNote}</p>
      <div className="preview-detail-author">
        <span className={`preview-avatar identity-${post.id % 3}`} aria-hidden="true">{post.author.slice(-2)}</span>
        <strong>{post.author}</strong>
        <span className="sample-author">{labels.sampleAuthor}</span>
      </div>
      <p className="preview-post-text">{post.text}</p>
    </div>
  );
}
