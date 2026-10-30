import type { ReactNode } from 'react';

// Markdown mínimo para leer resultados y respuestas: títulos, listas, código, negrita y cursiva.
// Se construyen elementos de React (nada de HTML crudo), así que el texto de la IA no puede inyectar nada.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const [, label, href] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok)!;
      out.push(
        /^https?:\/\//.test(href) ? (
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(' '), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>);
    blocks.push(list.ordered ? <ol key={`l${blocks.length}`}>{items}</ol> : <ul key={`l${blocks.length}`}>{items}</ul>);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flushPara();
      flushList();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith('```'); i++) code.push(lines[i]);
      blocks.push(
        <pre key={`c${blocks.length}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = inline(heading[2], `h${blocks.length}`);
      blocks.push(level === 1 ? <h3 key={`h${blocks.length}`}>{content}</h3> : <h4 key={`h${blocks.length}`}>{content}</h4>);
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else if (/^---+$/.test(line.trim())) {
      flushPara();
      flushList();
      blocks.push(<hr key={`r${blocks.length}`} />);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks}</div>;
}

/** Quita la cabecera (front matter) que se añade al guardar los resultados. */
export function stripFrontMatter(text: string): { meta: string[]; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text.replace(/\r/g, ''));
  if (!m) return { meta: [], body: text };
  return { meta: m[1].split('\n').filter(Boolean), body: text.replace(/\r/g, '').slice(m[0].length) };
}
