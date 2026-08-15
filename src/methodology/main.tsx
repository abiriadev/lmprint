import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles.css'
import { Methodology } from './Methodology'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Methodology />
	</StrictMode>,
)
