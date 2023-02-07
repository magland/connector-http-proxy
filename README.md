# mcmc-monitor-proxy

This is a proxy server for MCMC Monitor. It allows MCMC runs to be monitored from remote computers.

## Hosting a proxy server

This server is designed to run in the cloud on Heroku.

**Step 1: Create a new Heroku project**

Sign up for a [Heroku](https://heroku.com) account and Create a new app. Name it something like `mcmc-monitor-proxy-1`.

**Step 2: Set up a proxy secret**

To permit only authorized resources to connect to your proxy server, you must set up a proxy secret.

In the Heroku web console, open the Settings for your project and add a Config Variable called `PROXY_SECRET`. For the value, use a random string of characters. This will be the secret you share with trusted users to allow them to connect their resources to your proxy server.

**Step 3: Clone and set up this repo**

Follow the instructions in the Heroku web console to install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) and log in to Heroku from your computer. Then clone and set up this repo.

```bash
heroku login

git clone <this-repo>
cd mcmc-monitor-proxy

# replace with the name of your project
heroku git:remote -a mcmc-monitor-proxy-1
```

To deploy the server:

```bash
git push heroku main
```

Make a note of the URL where the server is being hosted. For example it might be `https://mcmc-monitor-proxy-1.herokuapp.com`. You will share this URL along with the proxy secret to allow users to connect their resources to your proxy server.