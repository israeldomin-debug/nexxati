import React from 'react';
import { cn } from '@/utils/helpers';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  role?: string;
  'aria-label'?: string;
}

/**
 * Componente de Card acessível
 */
export const Card: React.FC<CardProps> = ({
  children,
  className,
  onClick,
  ...props
}) => {
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component
      className={cn(
        'bg-white rounded-lg shadow-md p-6 border border-gray-200',
        onClick && 'cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-500',
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </Component>
  );
};
