import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  
  if (nextUrl.pathname.startsWith('/dashboard')) {
    if (!isLoggedIn) {
      // For NextAuth we can just redirect to the sign-in page.
      return NextResponse.redirect(new URL('/api/auth/signin', req.nextUrl))
    }
  }
  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
