import { useToast } from "@/hooks/use-toast"
import { APIError, ErrorLevel, StandardError } from "@/types/errors"
import { AlertTriangle, Info, AlertCircle, XCircle } from "lucide-react"

interface ErrorNotificationProps {
  error: APIError | StandardError | Error
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorNotification({ error, onRetry, onDismiss }: ErrorNotificationProps) {
  const { toast } = useToast()

  const getErrorLevel = (error: APIError | StandardError | Error): ErrorLevel => {
    if ('level' in error) return error.level
    if ('status' in error && error.status) {
      if (error.status >= 500) return 'error'
      if (error.status >= 400) return 'warn'
    }
    return 'error'
  }

  const getErrorIcon = (level: ErrorLevel) => {
    switch (level) {
      case 'info': return Info
      case 'warn': return AlertTriangle  
      case 'error': return AlertCircle
      case 'fatal': return XCircle
      default: return AlertCircle
    }
  }

  const getErrorTitle = (level: ErrorLevel) => {
    switch (level) {
      case 'info': return 'Information'
      case 'warn': return 'Warning'
      case 'error': return 'Error'
      case 'fatal': return 'Critical Error'
      default: return 'Error'
    }
  }

  const showError = () => {
    const level = getErrorLevel(error)
    const Icon = getErrorIcon(level)
    const title = getErrorTitle(level)
    
    const message = error.message || 'An unexpected error occurred'
    
    toast({
      variant: level === 'error' || level === 'fatal' ? 'destructive' : 'default',
      title,
      description: message,
      action: onRetry ? (
        <button 
          onClick={onRetry}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium"
        >
          Retry
        </button>
      ) : undefined,
    })
  }

  return null // This is a utility component that triggers toasts
}

// Standardized error notification hook
export function useErrorNotification() {
  const { toast } = useToast()

  const notifyError = (error: APIError | StandardError | Error, options?: {
    onRetry?: () => void
    dismissible?: boolean
  }) => {
    const level = 'level' in error ? error.level : 'error'
    const message = error.message || 'An unexpected error occurred'
    
    toast({
      variant: level === 'error' || level === 'fatal' ? 'destructive' : 'default',
      title: level === 'fatal' ? 'Critical Error' : 'Error',
      description: message,
      action: options?.onRetry ? (
        <button 
          onClick={options.onRetry}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium"
        >
          Retry
        </button>
      ) : undefined,
    })
  }

  const notifySuccess = (message: string) => {
    toast({
      title: "Success", 
      description: message,
    })
  }

  const notifyWarning = (message: string) => {
    toast({
      variant: 'default',
      title: "Warning",
      description: message,
    })
  }

  return {
    notifyError,
    notifySuccess,  
    notifyWarning
  }
}