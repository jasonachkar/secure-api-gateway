import { Check, ChevronDown, ChevronRight, Copy, WrapText } from 'lucide-react';
import { useState } from 'react';

export function JsonViewer({ value, label = 'JSON evidence' }: { value: unknown; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [wrap, setWrap] = useState(false);
  const formatted = JSON.stringify(value, null, 2);

  const copy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="json-viewer">
      <div className="json-viewer__toolbar">
        <button
          className="json-viewer__disclosure"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {label}
        </button>
        <span className="json-viewer__actions">
          <button type="button" onClick={() => setWrap((value) => !value)} aria-pressed={wrap}>
            <WrapText size={13} /> {wrap ? 'No wrap' : 'Wrap'}
          </button>
          <button type="button" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
      {expanded && (
        <pre className={wrap ? 'json-viewer__pre--wrapped' : undefined} tabIndex={0}>
          <code>{formatted}</code>
        </pre>
      )}
    </div>
  );
}
