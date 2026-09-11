import { IconName } from '../components/Icon';

/**
 * A more specific icon than the generic document mark, guessed from
 * keywords in a requirement/task label. Falls back to 'document' for
 * anything that doesn't match a recognizable verb — imprecise labels
 * should read as neutral, not get a wrong icon forced onto them.
 */
export function contentIcon(label: string): IconName {
  const text = label.toLowerCase();
  if (/research|survey|interview|audience|analy[sz]e|analysis/.test(text)) return 'search';
  if (/present|pitch|deck|slide/.test(text)) return 'chart';
  if (/report|write|draft|essay|summar(y|ise|ize)|paper/.test(text)) return 'edit';
  if (/calendar|schedule|timeline/.test(text)) return 'calendar';
  return 'document';
}
