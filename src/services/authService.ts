import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  deleteUser,
  updatePassword,
} from 'firebase/auth';
import { auth } from './firebaseConfig';

export type { FirebaseUser };

export const authService = {
  signIn: (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password),

  signOut: () => signOut(auth),

  onAuthStateChanged: (cb: (user: FirebaseUser | null) => void) =>
    onAuthStateChanged(auth, cb),

  getCurrentUser: () => auth.currentUser,

  createUser: (email: string, password: string) =>
    createUserWithEmailAndPassword(auth, email, password),

  updateUserPassword: (user: FirebaseUser, newPassword: string) =>
    updatePassword(user, newPassword),

  deleteUser: (user: FirebaseUser) => deleteUser(user),
};
