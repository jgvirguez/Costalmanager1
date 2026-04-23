import { auth } from './firebaseConfig';

interface SessionTimeout {
  duration: number; // en minutos
  warningTime: number; // minutos antes del timeout para mostrar advertencia
}

class SessionService {
  private static instance: SessionService;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private warningTimeout: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();
  private readonly DEFAULT_TIMEOUT: SessionTimeout = {
    duration: 480, // 8 horas
    warningTime: 10 // 10 minutos antes
  };

  private constructor() {
    this.setupActivityListeners();
  }

  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService();
    }
    return SessionService.instance;
  }

  private setupActivityListeners() {
    // Escuchar eventos de actividad del usuario
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      this.resetSessionTimeout();
    };

    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });
  }

  startSession() {
    console.log('Iniciando sesión con timeout');
    this.lastActivity = Date.now();
    this.resetSessionTimeout();
  }

  private resetSessionTimeout() {
    // Limpiar timeouts existentes
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
    }

    const timeoutMs = this.DEFAULT_TIMEOUT.duration * 60 * 1000;
    const warningMs = (this.DEFAULT_TIMEOUT.duration - this.DEFAULT_TIMEOUT.warningTime) * 60 * 1000;

    // Configurar advertencia antes del timeout
    this.warningTimeout = setTimeout(() => {
      this.showSessionWarning();
    }, warningMs);

    // Configurar timeout de sesión
    this.sessionTimeout = setTimeout(() => {
      this.forceLogout();
    }, timeoutMs);
  }

  private showSessionWarning() {
    const warningMinutes = this.DEFAULT_TIMEOUT.warningTime;
    
    if (confirm(`⚠️ Su sesión expirará en ${warningMinutes} minutos por inactividad.\n\n¿Desea continuar trabajando?`)) {
      this.resetSessionTimeout();
      console.log('Sesión extendida por actividad del usuario');
    } else {
      this.forceLogout();
    }
  }

  private async forceLogout() {
    console.log('Sesión expirada por inactividad - cerrando sesión');
    
    try {
      await auth.signOut();
      // Limpiar timeouts
      if (this.sessionTimeout) {
        clearTimeout(this.sessionTimeout);
        this.sessionTimeout = null;
      }
      if (this.warningTimeout) {
        clearTimeout(this.warningTimeout);
        this.warningTimeout = null;
      }
      
      // Recargar página para mostrar login
      window.location.reload();
    } catch (error) {
      console.error('Error cerrando sesión:', error);
      window.location.reload();
    }
  }

  getSessionInfo() {
    const now = Date.now();
    const elapsed = now - this.lastActivity;
    const remaining = (this.DEFAULT_TIMEOUT.duration * 60 * 1000) - elapsed;
    
    return {
      lastActivity: new Date(this.lastActivity),
      elapsedMinutes: Math.floor(elapsed / (60 * 1000)),
      remainingMinutes: Math.max(0, Math.floor(remaining / (60 * 1000))),
      isActive: remaining > 0
    };
  }

  extendSession() {
    this.lastActivity = Date.now();
    this.resetSessionTimeout();
    console.log('Sesión extendida manualmente');
  }

  clearSession() {
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }
  }
}

export const sessionService = SessionService.getInstance();
