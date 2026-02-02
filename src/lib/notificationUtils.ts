import { toast } from '@/hooks/use-toast';

export interface NotificationOptions {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

export const showErrorNotification = (
  error: any,
  defaultMessage: string = 'An error occurred',
  options: NotificationOptions = {}
) => {
  let message = defaultMessage;
  
  if (error?.message) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  // Check for specific error types
  if (message.toLowerCase().includes('invalid api key') || 
      message.toLowerCase().includes('unauthorized')) {
    message = 'Authentication failed. Please check your credentials and try again.';
  } else if (message.toLowerCase().includes('network') || 
             message.toLowerCase().includes('fetch')) {
    message = 'Network error. Please check your connection and try again.';
  }

  toast({
    title: options.title || 'Error',
    description: message,
    variant: options.variant || 'destructive',
    duration: options.duration || 5000,
  });
};

export const showSuccessNotification = (
  message: string,
  options: NotificationOptions = {}
) => {
  toast({
    title: options.title || 'Success',
    description: message,
    variant: 'default',
    duration: options.duration || 3000,
  });
};

export const showInfoNotification = (
  message: string,
  options: NotificationOptions = {}
) => {
  toast({
    title: options.title || 'Info',
    description: message,
    variant: 'default',
    duration: options.duration || 4000,
  });
};