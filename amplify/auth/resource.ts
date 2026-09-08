import { defineAuth } from '@aws-amplify/backend';

// Free tier: Cognito User Pools 50,000 MAUs Always-Free tier.
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  userAttributes: {
    email: {
      required: true,
      mutable: true,
    },
  },
});
