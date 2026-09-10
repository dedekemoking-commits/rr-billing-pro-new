import Constants from 'expo-constants';

export const GITHUB = {
  owner: 'dedekemoking-commits',
  repo: 'rr-billing-pro-new',
  path: 'users.json',
  token: Constants.expoConfig?.extra?.githubToken || '',
};
