import { HOME_TAB_CONTENT } from './HomeTabs';
import type { HomeTabId, TabProps } from './homeTabMeta';

export default function HomeTabPanel({ tab, ...props }: TabProps & { tab: Exclude<HomeTabId, 'search'> }) {
  const Content = HOME_TAB_CONTENT[tab];
  return <Content {...props} />;
}
