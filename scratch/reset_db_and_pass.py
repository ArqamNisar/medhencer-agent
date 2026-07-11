import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import os

def reset_db_and_pass():
    print("Connecting to postgres system database...")
    try:
        # Connect to system database 'postgres' to set password and create DB
        conn = psycopg2.connect(
            host="localhost",
            port=5432,
            user="postgres",
            database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # 1. Alter password of 'postgres' user to 'postgres'
        print("Changing password of 'postgres' user to 'postgres'...")
        cursor.execute("ALTER USER postgres WITH PASSWORD 'postgres';")
        print("[+] Password updated successfully.")
        
        # 2. Check if 'medhencer' database exists, create if not
        print("Checking if 'medhencer' database exists...")
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = 'medhencer';")
        exists = cursor.fetchone()
        
        if not exists:
            print("Database 'medhencer' does not exist. Creating...")
            cursor.execute("CREATE DATABASE medhencer;")
            print("[+] Database 'medhencer' created successfully.")
        else:
            print("[+] Database 'medhencer' already exists.")
            
        cursor.close()
        conn.close()
        
        # 3. Connect to 'medhencer' database and run schema.sql
        print("\nConnecting to 'medhencer' database to run schema.sql...")
        conn_db = psycopg2.connect(
            host="localhost",
            port=5432,
            user="postgres",
            password="postgres",
            database="medhencer"
        )
        cursor_db = conn_db.cursor()
        
        # Get absolute path of schema.sql in workspace root
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        schema_path = os.path.join(base_dir, "schema.sql")
        
        print(f"Reading schema from: {schema_path}")
        with open(schema_path, "r") as f:
            schema_sql = f.read()
            
        print("Executing schema.sql...")
        cursor_db.execute(schema_sql)
        conn_db.commit()
        print("[+] Schema initialized successfully.")
        
        cursor_db.close()
        conn_db.close()
        print("\nAll database setup actions completed successfully!")
        
    except Exception as e:
        print(f"[-] Error occurred: {e}")
        raise e

if __name__ == "__main__":
    reset_db_and_pass()
