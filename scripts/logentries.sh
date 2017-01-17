# Register logentries agent
le register --name $LOGENTRIES_HOSTNAME --account-key $LOGENTRIES_ACCOUNT_KEY \
    && le follow --account-key $LOGENTRIES_ACCOUNT_KEY --name out /app/log/out.log \
    && le follow --account-key $LOGENTRIES_ACCOUNT_KEY --name err /app/log/err.log \
    && service logentries restart
