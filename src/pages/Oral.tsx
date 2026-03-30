import { Navigate } from 'react-router-dom'

// Oral has been replaced by Reading — redirect old links
export default function Oral() {
  return <Navigate to="/reading" replace />
}
