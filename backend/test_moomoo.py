from futu import OpenD

print("Testing Moomoo connection...")

# Try to connect without setting log path
try:
    opend = OpenD(host="127.0.0.1", port=11111)
    print("OpenD instance created successfully")
    
    opend.connect()
    print("Connected to Moomoo OpenD successfully!")
    
    # Test getting market snapshot
    quote = opend.get_market_snapshot(["US.AAPL"])
    print(f"Quote response: {quote}")
    
    if len(quote) > 1 and len(quote[1]) > 0:
        price = quote[1][0]["last_price"]
        print(f"AAPL Price: ${price}")
    
    opend.close()
    print("Connection closed successfully")
except Exception as e:
    print(f"Error: {str(e)}")
    import traceback
    traceback.print_exc()
