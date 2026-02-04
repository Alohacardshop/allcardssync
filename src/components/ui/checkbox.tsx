import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, indeterminate, checked, ...props }, ref) => {
  const innerRef = React.useRef<HTMLButtonElement>(null);
  
  // Merge refs
  React.useImperativeHandle(ref, () => innerRef.current as HTMLButtonElement);
  
  // Set native indeterminate property for accessibility
  React.useEffect(() => {
    if (innerRef.current) {
      // The button element doesn't have indeterminate, but we set aria-checked
      const input = innerRef.current.querySelector('input');
      if (input) {
        input.indeterminate = !!indeterminate;
      }
    }
  }, [indeterminate]);

  // Determine the checked state for Radix
  const checkboxState = indeterminate ? "indeterminate" as const : checked;

  return (
    <CheckboxPrimitive.Root
      ref={innerRef}
      checked={checkboxState}
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("flex items-center justify-center text-current")}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
