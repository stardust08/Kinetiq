import { AlertCircle } from "lucide-react";
import { Button } from "../app/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../app/components/ui/alert";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  title?: string;
  variant?: "default" | "compact";
}

export function ErrorMessage({ 
  message, 
  onRetry, 
  title = "Error",
  variant = "default" 
}: ErrorMessageProps) {
  if (variant === "compact") {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-600 mb-2">{message}</p>
        {onRetry && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onRetry}
            className="text-red-600 border-red-300 hover:bg-red-50"
          >
            Retry
          </Button>
        )}
      </div>
    );
  }

  return (
    <Alert variant="destructive" className="bg-red-50 border-red-200">
      <AlertCircle className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-600">{title}</AlertTitle>
      <AlertDescription className="text-red-600">
        {message}
        {onRetry && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onRetry}
            className="mt-2 text-red-600 border-red-300 hover:bg-red-50"
          >
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
