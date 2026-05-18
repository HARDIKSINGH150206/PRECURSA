import { motion } from 'framer-motion'

export default function Card({ children, className = '', as: Component = motion.div, ...props }) {
  const Wrapper = Component || motion.div

  return (
    <Wrapper
      {...props}
      className={`glass-card ${className}`}
    >
      {children}
    </Wrapper>
  )
}
