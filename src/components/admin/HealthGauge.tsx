import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from "@/lib/utils";

interface HealthGaugeProps {
  title: string;
  score: number;
  maxScore?: number;
  trend?: 'up' | 'down' | 'stable';
  subtitle?: string;
  onClick?: () => void;
}

export function HealthGauge({ 
  title, 
  score, 
  maxScore = 100, 
  trend,
  subtitle,
  onClick 
}: HealthGaugeProps) {
  const percentage = (score / maxScore) * 100;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= 80) return 'hsl(var(--success))';
    if (percentage >= 60) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  const getGradientId = () => {
    if (percentage >= 80) return 'gradient-success';
    if (percentage >= 60) return 'gradient-warning';
    return 'gradient-destructive';
  };

  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-success" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-300 hover:shadow-hover",
        onClick && "cursor-pointer interactive-hover"
      )}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-4">
          {/* Circular Progress */}
          <div className="relative w-32 h-32">
            <svg 
              className="transform -rotate-90 w-32 h-32"
              width="128" 
              height="128"
            >
              <defs>
                <linearGradient id={getGradientId()} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: getColor(), stopOpacity: 0.8 }} />
                  <stop offset="100%" style={{ stopColor: getColor(), stopOpacity: 1 }} />
                </linearGradient>
              </defs>
              
              {/* Background Circle */}
              <circle
                cx="64"
                cy="64"
                r={radius}
                stroke="hsl(var(--muted))"
                strokeWidth="8"
                fill="none"
              />
              
              {/* Progress Circle */}
              <circle
                cx="64"
                cy="64"
                r={radius}
                stroke={`url(#${getGradientId()})`}
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-bold" style={{ color: getColor() }}>
                {Math.round(percentage)}
              </div>
              <div className="text-xs text-muted-foreground">
                / {maxScore}
              </div>
            </div>
          </div>

          {/* Title and Subtitle */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <h3 className="font-semibold text-base">{title}</h3>
              {trend && getTrendIcon()}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}