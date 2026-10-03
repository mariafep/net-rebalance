import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'

async function startApp() {
    const { initializeAuth } = useAuth()

    await initializeAuth()

    const app = createApp(App)

    app.use(router)

    app.mount('#app')
}

startApp()