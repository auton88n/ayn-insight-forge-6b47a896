import { lazy, type ComponentType } from 'react';
import type { HomeTabId, TabProps } from './homeTabMeta';

// The registry is deliberately lightweight and eagerly available. Each import
// names one feature, so navigation does not fetch a registry before its content.
const HOME_TAB_CONTENT: Record<Exclude<HomeTabId, 'search'>, ComponentType<TabProps>> = {
  features: lazy(() => import('./tabs/FeaturesTab')),
  'how-it-works': lazy(() => import('./tabs/HowItWorksTab')),
  'why-ayn': lazy(() => import('./tabs/WhyAynTab')),
  'get-discovered': lazy(() => import('./tabs/GetDiscoveredTab')),
  proof: lazy(() => import('./tabs/ProofTab')),
  faq: lazy(() => import('./tabs/FaqTab')),
  pricing: lazy(() => import('./tabs/PricingTab')),
  contact: lazy(() => import('./tabs/ContactTab')),
  about: lazy(() => import('./tabs/AboutTab')),
  help: lazy(() => import('./tabs/HelpTab')),
  profile: lazy(() => import('./AccountTabs').then(module => ({ default: module.ProfileAccountTab }))),
  'matched-jobs': lazy(() => import('./AccountTabs').then(module => ({ default: module.MatchedJobsAccountTab }))),
  'saved-jobs': lazy(() => import('./AccountTabs').then(module => ({ default: module.SavedJobsAccountTab }))),
  proposals: lazy(() => import('./AccountTabs').then(module => ({ default: module.ProposalsAccountTab }))),
  assessments: lazy(() => import('./AccountTabs').then(module => ({ default: module.AssessmentsAccountTab }))),
  'skills-to-learn': lazy(() => import('./AccountTabs').then(module => ({ default: module.SkillsToLearnAccountTab }))),
  'account-settings': lazy(() => import('./AccountTabs').then(module => ({ default: module.SettingsAccountTab }))),
};

export default function HomeTabPanel({ tab, ...props }: TabProps & { tab: Exclude<HomeTabId, 'search'> }) {
  const Content = HOME_TAB_CONTENT[tab];
  return <Content {...props} />;
}
