# Quick Vercel Deployment

## Fastest Way (5 minutes)

1. **Push to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Ready for Vercel"
   git push
   ```

2. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/new
   - Click "Import Git Repository"
   - Select your repository

3. **Configure Project**
   - **Root Directory**: `dashboard` ⚠️ **IMPORTANT!**
   - Framework: Vite (auto-detected)
   - Build Command: `npm run build` (auto-detected)
   - Output Directory: `dist` (auto-detected)

4. **Add Environment Variable**
   - Click "Environment Variables"
   - Add: `VITE_API_URL` = `https://your-backend-url.com`
   - Select: Production, Preview, Development

5. **Deploy**
   - Click "Deploy"
   - Wait ~2 minutes
   - Done! 🎉

## Your Dashboard URL

After deployment, you'll get:
- Production: `https://your-project.vercel.app`
- Preview: `https://your-project-git-branch.vercel.app`

## Important Notes

⚠️ **Root Directory**: Must be set to `dashboard` (not the repo root)

⚠️ **Backend URL**: Set `VITE_API_URL` to your backend API URL (no trailing slash)

⚠️ **CORS**: Make sure your backend allows requests from your Vercel domain

## Troubleshooting

**Build fails?**
- Check Root Directory is set to `dashboard`
- Check Node.js version (Vercel uses 18.x by default)

**API not connecting?**
- Verify `VITE_API_URL` environment variable
- Check backend CORS settings
- Check browser console for errors

**404 on page refresh?**
- The `vercel.json` should handle this automatically
- If not, verify the rewrite rule is present

For detailed instructions, see `DEPLOYMENT.md`

