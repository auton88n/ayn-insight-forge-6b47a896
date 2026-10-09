import { createElement, lazy, Suspense, type Attributes, type ComponentType, type ComponentProps } from 'react';
import { AynLoaderBlock } from './AynLoader';

/** A feature-sized boundary keeps the surrounding navigation usable while it loads. */
export function lazySection<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>) {
  const Content = lazy(load);
  return function DeferredSection(props: Props) {
    // No ref is introduced by this wrapper; preserve the loader's props.
    return <Suspense fallback={<AynLoaderBlock />}>{createElement(Content, props as Attributes & ComponentProps<typeof Content>)}</Suspense>;
  };
}
