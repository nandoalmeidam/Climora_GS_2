import type { ComponentProps } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva('', {
  variants: { variant: { default: 'primary', outline: 'secondary' }, size: { default: '', icon: 'icon-only' } },
  defaultVariants: { variant: 'default', size: 'default' },
})

export function Button({ asChild, className, variant, size, ...props }: ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return <Component data-slot="button" className={buttonVariants({ variant, size, className })} {...props} />
}
