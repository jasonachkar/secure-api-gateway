# Vercel Deployment Guide

This guide will help you deploy the Security Dashboard to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. The Vercel CLI installed (optional, for CLI deployment)
3. Your backend API deployed and accessible (for the `VITE_API_URL` environment variable)

## Deployment Methods

### Method 1: Deploy via Vercel Dashboard (Recommended)

1. **Push your code to GitHub/GitLab/Bitbucket**
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import Project on Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Git Repository"
   - Select your repository
   - **Important**: Set the **Root Directory** to `dashboard` (not the root of the repo)

3. **Configure Build Settings**
   - Framework Preset: **Vite**
   - Build Command: `npm run build` (should auto-detect)
   - Output Directory: `dist` (should auto-detect)
   - Install Command: `npm install` (should auto-detect)

4. **Set Environment Variables**
   Click "Environment Variables" and add:
   
   | Name | Value | Environment |
   |------|-------|-------------|
   | `VITE_API_URL` | Your backend API URL (e.g., `https://your-api.vercel.app` or `https://api.yourdomain.com`) | Production, Preview, Development |

   **Important Notes:**
   - If your backend is on a different domain, ensure CORS is configured to allow your Vercel domain
   - The backend URL should NOT have a trailing slash
   - Example: `https://api.example.com` ✅ (correct)
   - Example: `https://api.example.com/` ❌ (incorrect)

5. **Deploy**
   - Click "Deploy"
   - Wait for the build to complete
   - Your dashboard will be live at `https://your-project.vercel.app`

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Navigate to Dashboard Directory**
   ```bash
   cd dashboard
   ```

4. **Deploy**
   ```bash
   vercel
   ```
   
   Follow the prompts:
   - Link to existing project or create new? (Choose based on your preference)
   - Project name: (Enter a name or press Enter for default)
   - Directory: `./` (should be `dashboard` directory)
   - Override settings? No

5. **Set Environment Variables**
   ```bash
   vercel env add VITE_API_URL
   ```
   Enter your backend API URL when prompted.

6. **Deploy to Production**
   ```bash
   vercel --prod
   ```

## Post-Deployment Configuration

### 1. Custom Domain (Optional)

1. Go to your project settings on Vercel
2. Click "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

### 2. Environment Variables for Different Environments

You can set different API URLs for different environments:

- **Production**: Your production backend URL
- **Preview**: Your staging/development backend URL
- **Development**: `http://localhost:3000` (for local development)

### 3. Backend CORS Configuration

Make sure your backend allows requests from your Vercel domain:

```typescript
// In your backend CORS config
origin: [
  'https://your-dashboard.vercel.app',
  'https://your-custom-domain.com',
  // Add preview URLs if needed
]
```

Or if you've already set `origin: true` in your backend, it should work automatically.

## Troubleshooting

### Build Fails

1. **Check Node.js version**: Vercel uses Node.js 18.x by default. If you need a different version, add a `.nvmrc` file:
   ```bash
   echo "18" > dashboard/.nvmrc
   ```

2. **Check build logs**: Look at the build output in Vercel dashboard for specific errors

3. **Verify dependencies**: Make sure all dependencies are in `package.json` (not just `package-lock.json`)

### API Connection Issues

1. **Check environment variable**: Verify `VITE_API_URL` is set correctly
2. **Check CORS**: Ensure backend allows your Vercel domain
3. **Check network tab**: Open browser DevTools → Network tab to see actual API calls
4. **Verify API URL format**: Should be `https://api.example.com` (no trailing slash, no `/api` suffix)

### Routing Issues (404 on refresh)

The `vercel.json` file includes a rewrite rule to handle client-side routing. If you still get 404s:

1. Verify `vercel.json` is in the `dashboard` directory
2. Check that the rewrite rule is correct
3. Ensure you're deploying from the `dashboard` directory, not the root

### SSE (Server-Sent Events) Not Working

If real-time metrics aren't working:

1. **Check API URL**: Ensure `VITE_API_URL` points to your backend
2. **Check CORS**: SSE requires proper CORS headers
3. **Check backend logs**: Verify the SSE endpoint is accessible
4. **Network tab**: Check if the SSE connection is being established

## Continuous Deployment

Once connected to Git:

- **Automatic deployments**: Every push to `main` branch deploys to production
- **Preview deployments**: Every push to other branches creates a preview deployment
- **Pull Request previews**: Each PR gets its own preview URL

## Monitoring

1. **Vercel Analytics**: Enable in project settings for performance monitoring
2. **Logs**: Check function logs in Vercel dashboard
3. **Real User Monitoring**: Consider adding error tracking (e.g., Sentry)

## Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **API Keys**: Store sensitive keys in Vercel environment variables, not in code
3. **HTTPS**: Vercel provides HTTPS by default
4. **CORS**: Ensure backend CORS is properly configured

## Next Steps

After deployment:

1. Test all features (login, dashboard, threats, incidents, compliance)
2. Verify real-time metrics are working
3. Check mobile responsiveness
4. Set up monitoring and alerts
5. Configure custom domain (if needed)
6. Set up CI/CD for automated deployments

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord
- Project Issues: Check your repository

