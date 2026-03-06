## Configure Postfix SMTP Relay to Send Emails from Docker Containers
Allow the Docker network to relay through Postfix:

Ensure your host Postfix trusts the Docker network (172.16.0.0/12 covers all default Docker bridge subnets):

<!-- cSpell: ignore mynetworks -->

```bash
# /etc/postfix/main.cf
mynetworks = 127.0.0.0/8 172.16.0.0/12 [::1]/128

sudo postfix reload
```

Firewall must allow traffic from docker bridge to postfix port (25) on host machine

```bash
sudo ufw allow from 172.17.0.0/16 to any port 25 proto tcp
```

Verify connectivity from inside the container:

```bash
docker run --rm alpine nc -zv host.docker.internal 25
```