import React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface FormField {
  name: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'select'
  placeholder?: string
  required?: boolean
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
}

interface TouchOptimizedFormProps {
  title: string
  fields: FormField[]
  values: Record<string, any>
  onChange: (name: string, value: any) => void
  onSubmit: (values: Record<string, any>) => void
  onCancel?: () => void
  submitLabel?: string
  loading?: boolean
}

export function TouchOptimizedForm({
  title,
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel = "Submit",
  loading = false
}: TouchOptimizedFormProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  const renderField = (field: FormField) => {
    const commonProps = {
      id: field.name,
      name: field.name,
      value: values[field.name] || "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => 
        onChange(field.name, e.target.value),
      placeholder: field.placeholder,
      required: field.required,
      // Mobile optimizations
      className: `
        min-h-[48px] text-base
        focus:ring-2 focus:ring-primary focus:border-primary
        touch-manipulation
      `.trim()
    }

    switch (field.type) {
      case 'textarea':
        return (
          <Textarea
            {...commonProps}
            rows={4}
            className={`${commonProps.className} resize-none`}
          />
        )

      case 'number':
        return (
          <Input
            {...commonProps}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            inputMode="numeric"
            pattern="[0-9]*"
          />
        )

      case 'select':
        return (
          <Select
            value={values[field.name] || ""}
            onValueChange={(value) => onChange(field.name, value)}
          >
            <SelectTrigger className="min-h-[48px] text-base">
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      default:
        return <Input {...commonProps} type={field.type} />
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label 
                htmlFor={field.name}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {field.label}
                {field.required && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              {renderField(field)}
            </div>
          ))}

          {/* Form Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-6">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="min-h-[48px] w-full sm:w-auto"
                disabled={loading}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              className="min-h-[48px] w-full sm:w-auto"
              disabled={loading}
            >
              {loading ? "Processing..." : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}