import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  confirmSignUp as amplifyConfirmSignUp,
  resendSignUpCode as amplifyResendSignUpCode,
  signOut as amplifySignOut,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';

export interface User {
  email: string;
  name: string;
  tenantId: string;
  token: string;
}

export interface SignUpResult {
  isSignUpComplete: boolean;
  nextStep: {
    signUpStep: string;
    codeDeliveryDetails?: {
      deliveryMedium?: string;
      destination?: string;
    };
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  confirmSignUp: (email: string, confirmationCode: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSession = async () => {
    try {
      const current = await getCurrentUser();
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      const token = idToken?.toString() || '';
      const email = (idToken?.payload?.email as string) || current.signInDetails?.loginId || current.username || '';
      const tenantId = current.userId; // Cognito sub

      setUser({
        email,
        name: email.split('@')[0] || 'Operator',
        tenantId,
        token,
      });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshSession();
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await amplifySignIn({
      username: email.trim().toLowerCase(),
      password,
    });

    if (result.isSignedIn) {
      await refreshSession();
    } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
      throw new Error('CONFIRM_SIGN_UP_REQUIRED');
    } else {
      throw new Error(`Sign in incomplete: ${result.nextStep?.signInStep}`);
    }
  };

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    const formattedEmail = email.trim().toLowerCase();
    const result = await amplifySignUp({
      username: formattedEmail,
      password,
      options: {
        userAttributes: {
          email: formattedEmail,
        },
      },
    });

    const nextStep = result.nextStep;
    let deliveryDetails: { deliveryMedium?: string; destination?: string } | undefined;
    if ('codeDeliveryDetails' in nextStep && nextStep.codeDeliveryDetails) {
      const details = nextStep.codeDeliveryDetails as { deliveryMedium?: string; destination?: string };
      deliveryDetails = {
        deliveryMedium: details.deliveryMedium,
        destination: details.destination,
      };
    }

    return {
      isSignUpComplete: result.isSignUpComplete,
      nextStep: {
        signUpStep: nextStep.signUpStep,
        codeDeliveryDetails: deliveryDetails,
      },
    };
  };

  const confirmSignUp = async (email: string, confirmationCode: string) => {
    await amplifyConfirmSignUp({
      username: email.trim().toLowerCase(),
      confirmationCode: confirmationCode.trim(),
    });
  };

  const resendConfirmationCode = async (email: string) => {
    await amplifyResendSignUpCode({
      username: email.trim().toLowerCase(),
    });
  };

  const signOut = async () => {
    try {
      await amplifySignOut();
    } catch (err) {
      console.warn('SignOut error:', err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signUp,
        confirmSignUp,
        resendConfirmationCode,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
